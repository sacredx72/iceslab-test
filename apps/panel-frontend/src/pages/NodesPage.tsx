import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Code,
  CopyButton,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IconEdit,
  IconKey,
  IconLayoutGrid,
  IconLayoutList,
  IconPlus,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
  createBinding,
  createNode,
  deleteNode,
  getDashboardOverview,
  listNodes,
  listRegions,
  refreshNodeBootstrap,
  updateNode,
  type CreateNodeInput,
  type Node,
  type UpdateNodeInput,
} from '../lib/api';
import { NodeFormModal } from '../components/NodeFormModal';
import { NodeEditModal } from '../components/NodeEditModal';
import { NodePayloadModal } from '../components/NodePayloadModal';
import { NodeCard } from '../components/NodeCard';
import { countryFlag } from '../lib/countries';
import { parseNodeAgentPort, pickFreeQuickDeployPort } from '../lib/ports';
import { PageHero } from '../components/PageHero';
import { PrimaryButton } from '../components/PrimaryButton';

const HAIRLINE = '#1C2A3D';
const CARD = '#0F1A28';
const SNOW = '#C8D4E3';
const MIST = '#7A8BA3';
const CYAN = '#7DD3FC';
const MOSS = '#A7D8B9';
const AMBER = '#F5B14C';
const RED = '#E07A5F';

const MONO = { fontFamily: "'Geist Mono', monospace" };

const STATUS_ACCENT: Record<string, string> = {
  online: MOSS,
  unknown: MIST,
  offline: RED,
  unreachable: RED,
  disabled: MIST,
  degraded: AMBER,
};

function formatBytes(n: number): string {
  if (!n || n === 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const i = Math.min(Math.floor(Math.log2(Math.max(1, n)) / 10), units.length - 1);
  const v = n / 1024 ** i;
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

type LayoutMode = 'cards' | 'compact';
const LAYOUT_KEY = 'iceslab:nodes-layout';

export function NodesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [createOpen, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [editing, setEditing] = useState<Node | null>(null);
  const [payload, setPayload] = useState<{
    name: string;
    payload: string;
    bootstrap?: { token: string; expiresAt: string; command: string };
  } | null>(null);
  const [layout, setLayout] = useState<LayoutMode>(
    (typeof window !== 'undefined' &&
      (window.localStorage.getItem(LAYOUT_KEY) as LayoutMode | null)) ||
      'cards',
  );
  function setLayoutPersist(m: LayoutMode) {
    setLayout(m);
    if (typeof window !== 'undefined') window.localStorage.setItem(LAYOUT_KEY, m);
  }

  // Slice 27.5 - region filter (URL chip below header). 'all' = no filter.
  const [regionFilter, setRegionFilter] = useState<string>('all');

  const nodesQuery = useQuery({
    queryKey: ['nodes', regionFilter],
    queryFn: () =>
      listNodes({
        page: 1,
        limit: 100,
        regionId: regionFilter === 'all' ? undefined : regionFilter,
      }),
  });
  const regionsQuery = useQuery({ queryKey: ['regions'], queryFn: listRegions });
  const regionsById = useMemo(() => {
    const m = new Map<string, { code: string; name: string }>();
    for (const r of regionsQuery.data?.regions ?? []) m.set(r.id, r);
    return m;
  }, [regionsQuery.data]);

  // Pull live metrics from dashboard endpoint - already provides cpu/ram/disk
  // per node + today's traffic + inboundCount. Refetch every 15s to keep
  // cards in sync with the agent metrics-poll cron.
  const overviewQuery = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: getDashboardOverview,
    refetchInterval: 15_000,
  });

  // Merge raw nodes (canonical source for actions / address) with dashboard
  // metrics (CPU/RAM/disk/today). Indexed by id for O(1) join.
  const enrichedNodes = useMemo(() => {
    const overviewById = new Map(
      (overviewQuery.data?.nodes ?? []).map((n) => [n.id, n]),
    );
    return (nodesQuery.data?.nodes ?? []).map((n) => ({
      ...n,
      overview: overviewById.get(n.id) ?? null,
    }));
  }, [nodesQuery.data, overviewQuery.data]);

  const createMutation = useMutation({
    mutationFn: createNode,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['nodes'] });
      notifications.show({ color: 'green', message: 'Node created' });
      // Surface the one-time payload + bootstrap token - neither is shown
      // by the panel on subsequent reads.
      setPayload({
        name: data.name,
        payload: data.payload,
        bootstrap: data.bootstrap,
      });
    },
    onError: (err) =>
      notifications.show({
        color: 'red',
        title: 'Create failed',
        message: err instanceof Error ? err.message : String(err),
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateNodeInput }) => updateNode(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nodes'] });
      notifications.show({ color: 'green', message: 'Node updated' });
    },
    onError: (err) =>
      notifications.show({
        color: 'red',
        title: 'Update failed',
        message: err instanceof Error ? err.message : String(err),
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNode,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nodes'] });
      notifications.show({ color: 'green', message: 'Node deleted' });
    },
    onError: (err) =>
      notifications.show({
        color: 'red',
        title: 'Delete failed',
        message: err instanceof Error ? err.message : String(err),
      }),
  });

  // Re-issue a bootstrap token for an existing node - used when the original
  // expired / was lost, or when admin changed `node.address` and needs a new
  // cert with the matching SAN. Reuses the same NodePayloadModal as the create
  // flow, but `payload` stays empty (panel never re-emits the cert payload -
  // only the install command + token).
  const refreshBootstrapMutation = useMutation({
    mutationFn: (node: Node) =>
      refreshNodeBootstrap(node.id).then((info) => ({ node, info })),
    onSuccess: ({ node, info }) => {
      notifications.show({ color: 'green', message: 'New bootstrap token issued' });
      setPayload({
        name: node.name,
        payload: '',
        bootstrap: info,
      });
    },
    onError: (err) =>
      notifications.show({
        color: 'red',
        title: 'Refresh bootstrap failed',
        message: err instanceof Error ? err.message : String(err),
      }),
  });

  function handleRefreshBootstrap(node: Node) {
    modals.openConfirmModal({
      title: t('nodeConfirm.reBootstrapTitle', { name: node.name }),
      children: (
        <Text size="sm">{t('nodeConfirm.reBootstrapBody')}</Text>
      ),
      labels: { confirm: t('nodeConfirm.reBootstrapConfirm'), cancel: t('common.cancel') },
      confirmProps: { color: 'blue' },
      onConfirm: () => refreshBootstrapMutation.mutate(node),
    });
  }

  function handleDelete(node: Node) {
    // Cleanup command shown post-delete so admins remember to wipe the
    // VPS - otherwise the orphaned agent keeps occupying the mTLS port
    // and an old server cert + CA pair sits around as future drift bait.
    const uninstallCmd =
      'bash <(curl -fsSL https://raw.githubusercontent.com/icecompany-tech/iceslab/main/scripts/install-iceslab-node.sh) --uninstall';
    modals.openConfirmModal({
      title: t('nodeConfirm.deleteTitle', { name: node.name }),
      children: (
        <Stack gap="sm">
          <Text size="sm">{t('nodeConfirm.deleteBody')}</Text>
          <Text size="sm" fw={600}>
            {t('nodeConfirm.deleteCleanupHint')}
          </Text>
          <Group gap="xs" align="flex-start" wrap="nowrap">
            <Code block style={{ flex: 1, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {uninstallCmd}
            </Code>
            <CopyButton value={uninstallCmd}>
              {({ copied, copy }) => (
                <Button size="xs" variant="light" color={copied ? 'teal' : 'blue'} onClick={copy}>
                  {copied ? t('common.copied') : t('common.copy')}
                </Button>
              )}
            </CopyButton>
          </Group>
        </Stack>
      ),
      labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteMutation.mutate(node.id),
    });
  }

  return (
    <Stack>
      <PageHero
        eyebrow={t('pageHero.nodesEyebrow', {
          vps: enrichedNodes.length,
          countries: new Set(enrichedNodes.map((n) => n.countryCode).filter(Boolean)).size,
        })}
        title={t('pageHero.nodesTitle')}
        subtitle={t('pageHero.nodesSubtitle')}
        right={
          <Group gap={8}>
            <PrimaryButton leftSection={<IconPlus size={14} />} onClick={openCreate}>
              {t('nodes.create')}
            </PrimaryButton>
          </Group>
        }
      />
      <Group justify="space-between" align="center">
        <Group gap={8}>
          <SegmentedControl
            size="xs"
            value={layout}
            onChange={(v) => setLayoutPersist(v as LayoutMode)}
            data={[
              {
                value: 'cards',
                label: (
                  <Group gap={4} wrap="nowrap">
                    <IconLayoutGrid size={12} />
                    <Text size="xs">{t('nodes.layoutCards')}</Text>
                  </Group>
                ),
              },
              {
                value: 'compact',
                label: (
                  <Group gap={4} wrap="nowrap">
                    <IconLayoutList size={12} />
                    <Text size="xs">{t('nodes.layoutCompact')}</Text>
                  </Group>
                ),
              },
            ]}
          />
          <Tooltip label={t('common.refresh')}>
            <ActionIcon
              variant="subtle"
              size="lg"
              onClick={() => {
                qc.invalidateQueries({ queryKey: ['nodes'] });
                qc.invalidateQueries({ queryKey: ['dashboard'] });
              }}
              loading={nodesQuery.isFetching || overviewQuery.isFetching}
              style={{ color: MIST }}
            >
              <IconRefresh size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Slice 27.5 - region filter row. Hidden when admin hasn't created
          any regions yet (no clutter on a fresh panel). */}
      {(regionsQuery.data?.regions ?? []).length > 0 && (
        <Group gap="xs" wrap="wrap">
          <Badge
            variant={regionFilter === 'all' ? 'filled' : 'light'}
            color="blue"
            size="lg"
            style={{ cursor: 'pointer', textTransform: 'none' }}
            onClick={() => setRegionFilter('all')}
          >
            {t('nodes.regionFilterAll')}
          </Badge>
          {(regionsQuery.data?.regions ?? []).map((r) => (
            <Badge
              key={r.id}
              variant={regionFilter === r.id ? 'filled' : 'light'}
              color="cyan"
              size="lg"
              style={{ cursor: 'pointer', textTransform: 'none' }}
              onClick={() => setRegionFilter(r.id)}
            >
              {r.code} · {r.name}
            </Badge>
          ))}
        </Group>
      )}

      {enrichedNodes.length === 0 ? (
        <Text ta="center" py="xl" style={{ color: MIST }}>
          {t('nodes.empty')}
        </Text>
      ) : layout === 'cards' ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="md">
          {enrichedNodes.map((n) => {
            // Synthesise a DashboardNode shape if metrics haven't arrived yet -
            // card still renders with status from /api/nodes, just shows
            // metrics placeholder.
            const dashNode = n.overview ?? {
              id: n.id,
              name: n.name,
              status: n.status,
              countryCode: n.countryCode,
              lastStatusChange: n.lastStatusChange,
              inboundCount: 0,
              todayBytes: 0,
              metrics: null,
            };
            const regionLabel = n.regionId
              ? (regionsById.get(n.regionId)?.code ?? null)
              : null;
            return (
              <NodeCard
                key={n.id}
                node={{
                  ...dashNode,
                  rawId: n.id,
                  regionLabel,
                  maxUsers: n.maxUsers ?? null,
                  // approxUsers: capacity bar source. Real per-node user
                  // counter lands with slice 28; here we reuse the today's
                  // bytes-driven inbound count as a placeholder so the bar
                  // shows *something* meaningful - admins prefer "looks
                  // approximately right" over "shows nothing".
                  approxUsers: dashNode.inboundCount ?? 0,
                }}
                onEdit={() => setEditing(n)}
                onDelete={() => handleDelete(n)}
                onRefreshBootstrap={() => handleRefreshBootstrap(n)}
                refreshLoading={
                  refreshBootstrapMutation.isPending &&
                  refreshBootstrapMutation.variables?.id === n.id
                }
              />
            );
          })}
        </SimpleGrid>
      ) : (
        <Table.ScrollContainer
          minWidth={800}
          style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${HAIRLINE}` }}
        >
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
                <Table.Th style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: MIST }}>{t('nodes.table.name')}</Table.Th>
                <Table.Th style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: MIST }}>{t('nodes.table.address')}</Table.Th>
                <Table.Th style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: MIST }}>{t('nodes.table.country')}</Table.Th>
                <Table.Th style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: MIST }}>{t('nodes.table.status')}</Table.Th>
                <Table.Th style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: MIST }}>{t('nodes.table.bindings')}</Table.Th>
                <Table.Th style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: MIST }}>{t('nodes.table.today')}</Table.Th>
                <Table.Th style={{ width: 1, ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: MIST }}>{t('common.actions')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {enrichedNodes.map((n) => {
                const accent = STATUS_ACCENT[n.status] ?? MIST;
                const isOffline = n.status === 'offline' || n.status === 'unreachable';
                return (
                  <Table.Tr
                    key={n.id}
                    style={{
                      backgroundColor: isOffline ? `${RED}08` : undefined,
                      borderBottom: `1px solid ${HAIRLINE}`,
                    }}
                  >
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: accent,
                            boxShadow: `0 0 8px ${accent}99`,
                            flexShrink: 0,
                          }}
                        />
                        <Text fw={500} style={{ color: SNOW }}>{n.name}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" style={{ ...MONO, color: SNOW }}>{n.address}</Text>
                    </Table.Td>
                    <Table.Td>
                      {n.countryCode ? (
                        <Group gap={4} wrap="nowrap">
                          <Text>{countryFlag(n.countryCode)}</Text>
                          <Text size="sm" style={{ ...MONO, color: MIST }}>{n.countryCode}</Text>
                        </Group>
                      ) : (
                        <Text style={{ color: MIST }}>-</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        style={{
                          backgroundColor: `${accent}1A`,
                          color: accent,
                          border: `1px solid ${accent}33`,
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                          ...MONO,
                          letterSpacing: '0.08em',
                        }}
                      >
                        {n.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" style={{ ...MONO, color: SNOW }}>
                        {n.overview?.inboundCount ?? 0}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" style={{ ...MONO, color: SNOW }}>
                        {n.overview ? formatBytes(n.overview.todayBytes) : '-'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <Tooltip label={t('nodes.refreshBootstrap')}>
                          <ActionIcon
                            variant="outline"
                            size="sm"
                            loading={
                              refreshBootstrapMutation.isPending &&
                              refreshBootstrapMutation.variables?.id === n.id
                            }
                            onClick={() => handleRefreshBootstrap(n)}
                            style={{ borderColor: `${CYAN}55`, color: CYAN }}
                          >
                            <IconKey size={14} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label={t('common.edit')}>
                          <ActionIcon variant="subtle" size="sm" onClick={() => setEditing(n)} style={{ color: MIST }}>
                            <IconEdit size={14} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label={t('common.delete')}>
                          <ActionIcon variant="subtle" size="sm" color="red" onClick={() => handleDelete(n)}>
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <NodeFormModal
        opened={createOpen}
        onClose={closeCreate}
        node={null}
        loading={createMutation.isPending}
        onSubmit={async (input, profileIds) => {
          // Step 1: register the node and get its ID. Bootstrap modal opens
          // automatically via createMutation.onSuccess.
          const created = await createMutation.mutateAsync(input as CreateNodeInput);
          // Step 2: auto-create bindings for each picked profile. Done in
          // sequence (low volume - admin won't pick 50 profiles at once)
          // and tolerant - one binding failure doesn't block the rest.
          if (profileIds.length > 0) {
            const ok: string[] = [];
            const fail: string[] = [];
            // Assign a distinct port per profile. A fresh node has no bindings
            // yet, so hardcoding 443 made every profile after the first collide
            // (409 PORT_IN_USE). Reserve the node-agent's own mTLS port so an
            // inbound never shadows it, and feed each pick the ports already
            // assigned in this batch.
            const agentPort = parseNodeAgentPort((input as CreateNodeInput).address);
            const reserved = agentPort !== null ? [agentPort] : [];
            const assigned: number[] = [];
            for (const profileId of profileIds) {
              const port = pickFreeQuickDeployPort(assigned, reserved);
              try {
                await createBinding({ profileId, nodeId: created.id, port });
                assigned.push(port);
                ok.push(profileId);
              } catch {
                fail.push(profileId);
              }
            }
            qc.invalidateQueries({ queryKey: ['bindings'] });
            qc.invalidateQueries({ queryKey: ['profiles'] });
            if (fail.length > 0) {
              notifications.show({
                color: 'yellow',
                title: t('nodeConfirm.bindingsPartialTitle'),
                message: t('nodeConfirm.bindingsPartialMessage', { ok: ok.length, fail: fail.length }),
              });
            } else {
              notifications.show({
                color: 'green',
                message: t('nodeConfirm.bindingsAllOk', { count: ok.length }),
              });
            }
          }
        }}
      />

      <NodeEditModal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        node={editing}
        saving={updateMutation.isPending}
        refreshing={
          refreshBootstrapMutation.isPending &&
          refreshBootstrapMutation.variables?.id === editing?.id
        }
        onSubmit={async (input) => {
          if (!editing) return;
          await updateMutation.mutateAsync({ id: editing.id, input });
          setEditing(null);
        }}
        onDelete={() => {
          if (!editing) return;
          handleDelete(editing);
          setEditing(null);
        }}
        onRefreshBootstrap={() => {
          if (!editing) return;
          handleRefreshBootstrap(editing);
        }}
      />

      {payload && (
        <NodePayloadModal
          opened={true}
          onClose={() => setPayload(null)}
          nodeName={payload.name}
          payload={payload.payload}
          bootstrap={payload.bootstrap}
        />
      )}
    </Stack>
  );
}
