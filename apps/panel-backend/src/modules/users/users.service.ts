import type { Prisma } from '../../generated/prisma/client.js';
import { generateUserCredentials } from '../../lib/credentials.js';
import { eventBus } from '../../lib/event-bus.js';
import { ALL_SQUAD_ID } from '../squads/squads.constants.js';
import * as repo from './users.repository.js';
import type {
  CreateUserInput,
  UpdateUserInput,
  ListUsersQuery,
} from './users.schemas.js';
import { mapUserToPublic, type PublicUserDto } from './users.mapper.js';

// ───── Domain errors ─────

export class UserAlreadyExistsError extends Error {
  constructor(public username: string) {
    super(`User "${username}" already exists`);
    this.name = 'UserAlreadyExistsError';
  }
}

export class UserNotFoundError extends Error {
  constructor(public id: string) {
    super(`User ${id} not found`);
    this.name = 'UserNotFoundError';
  }
}

// ───── Helpers ─────

const BYTES_PER_GB = 1_073_741_824n;

function gbToBytes(gb: number | null | undefined): bigint | null {
  return gb != null ? BigInt(gb) * BYTES_PER_GB : null;
}

function daysFromNow(days: number | null | undefined): Date | null {
  return days != null ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
}

function toBigIntOrNull(value: number | string | null | undefined): bigint | null {
  return value != null ? BigInt(value) : null;
}

// ───── Service methods ─────

export async function createUser(input: CreateUserInput): Promise<PublicUserDto> {
  const existing = await repo.findActiveByUsername(input.username);
  if (existing) {
    throw new UserAlreadyExistsError(input.username);
  }

  const creds = generateUserCredentials();

  const user = await repo.create({
    username: input.username,
    shortId: creds.shortId,
    subscriptionToken: creds.subscriptionToken,

    hysteriaPassword:    creds.hysteriaPassword,
    naivePassword:       creds.naivePassword,
    xrayUuid:            creds.xrayUuid,
    amneziawgPrivateKey: creds.amneziawgPrivateKey,
    amneziawgPublicKey:  creds.amneziawgPublicKey,

    trafficLimitBytes:    gbToBytes(input.trafficLimitGb),
    trafficLimitStrategy: input.trafficLimitStrategy,
    expireAt:             daysFromNow(input.expireDays),

    hwidDeviceLimit: input.hwidDeviceLimit ?? null,
    description:     input.description ?? null,
    tag:             input.tag ?? null,
    telegramId:      toBigIntOrNull(input.telegramId),
    email:           input.email ?? null,

    enabledProtocols: input.enabledProtocols,

    traffic: { create: {} },
    groupMembers: {
      // When admin doesn't pick any squads explicitly, drop the user into
      // the seeded "All" squad — it grants visibility of every inbound and
      // matches pre-slice-26 behaviour. Slice 26 invariant: every user is in
      // at least one group, otherwise their subscription would be empty.
      create: (input.groupIds.length > 0 ? input.groupIds : [ALL_SQUAD_ID]).map(
        (groupId) => ({ groupId }),
      ),
    },
  });

  eventBus.emit('user.created', {
    userId: user.id,
    username: user.username,
  });

  return mapUserToPublic(user, user.traffic);
}

export async function listUsers(query: ListUsersQuery): Promise<{
  users: PublicUserDto[];
  total: number;
  page: number;
  limit: number;
}> {
  const { users, total } = await repo.list(query);
  return {
    users: users.map((u) => mapUserToPublic(u, u.traffic)),
    total,
    page: query.page,
    limit: query.limit,
  };
}

export async function getUserById(id: string): Promise<PublicUserDto> {
  const user = await repo.findActiveById(id);
  if (!user) {
    throw new UserNotFoundError(id);
  }
  return mapUserToPublic(user, user.traffic);
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
): Promise<PublicUserDto> {
  const existing = await repo.findActiveById(id);
  if (!existing) {
    throw new UserNotFoundError(id);
  }

  const data: Prisma.UserUpdateInput = {};
  const changedFields: string[] = [];

  if (input.status !== undefined) {
    data.status = input.status;
    changedFields.push('status');
  }
  if (input.trafficLimitGb !== undefined) {
    data.trafficLimitBytes = gbToBytes(input.trafficLimitGb);
    changedFields.push('trafficLimitBytes');
  }
  if (input.trafficLimitStrategy !== undefined) {
    data.trafficLimitStrategy = input.trafficLimitStrategy;
    changedFields.push('trafficLimitStrategy');
  }
  if (input.expireAt !== undefined) {
    data.expireAt = input.expireAt ? new Date(input.expireAt) : null;
    changedFields.push('expireAt');
  }
  if (input.hwidDeviceLimit !== undefined) {
    data.hwidDeviceLimit = input.hwidDeviceLimit;
    changedFields.push('hwidDeviceLimit');
  }
  if (input.description !== undefined) {
    data.description = input.description;
    changedFields.push('description');
  }
  if (input.tag !== undefined) {
    data.tag = input.tag;
    changedFields.push('tag');
  }
  if (input.telegramId !== undefined) {
    data.telegramId = toBigIntOrNull(input.telegramId);
    changedFields.push('telegramId');
  }
  if (input.email !== undefined) {
    data.email = input.email;
    changedFields.push('email');
  }
  if (input.groupIds !== undefined) {
    data.groupMembers = {
      deleteMany: {},
      create: input.groupIds.map((groupId) => ({ groupId })),
    };
    changedFields.push('groupIds');
  }
  if (input.enabledProtocols !== undefined) {
    data.enabledProtocols = input.enabledProtocols;
    changedFields.push('enabledProtocols');
  }

  const updated = await repo.updateById(id, data);

  if (changedFields.length > 0) {
    eventBus.emit('user.updated', {
      userId: id,
      changes: changedFields,
    });
  }

  // Status transition is a separate, more specific event
  if (input.status && input.status !== existing.status) {
    eventBus.emit('user.status-changed', {
      userId: id,
      from: existing.status,
      to: input.status,
    });
  }

  return mapUserToPublic(updated, updated.traffic);
}

export async function deleteUser(id: string): Promise<void> {
  const exists = await repo.existsActive(id);
  if (!exists) {
    throw new UserNotFoundError(id);
  }

  await repo.softDelete(id);

  eventBus.emit('user.deleted', { userId: id });
}