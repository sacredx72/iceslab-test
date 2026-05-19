import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Badge,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconCheck, IconStar, IconStarFilled } from '@tabler/icons-react';
import type { ProtocolName } from '../lib/api';
import { recipesForProtocol, type Recipe } from '../lib/recipes';

interface Props {
  protocol: ProtocolName;
  onPick: (recipe: Recipe) => void;
}

/**
 * Recipe gallery shown above the protocol-specific config block in
 * ProfileFormModal. One click pre-fills a known-good combo so admins
 * don't need to reason about REALITY/Vision/transport compatibility
 * matrices themselves.
 *
 * The chosen recipe stays highlighted but doesn't lock the form - admins
 * can still tweak individual fields after applying.
 */
/**
 * Resolve a recipe's user-visible text from the i18n bundle, falling
 * back to the recipe's hardcoded value if there's no translation key.
 * Lets the source-of-truth recipes.ts stay in russian (the original
 * authoring language) while letting the en.ts override every string
 * by id.
 */
function useRecipeText(recipe: Recipe) {
  const { t, i18n } = useTranslation();
  const base = `recipes.cards.${recipe.id}`;
  const has = (suffix: string) => i18n.exists(`${base}.${suffix}`);
  return {
    name: has('name') ? t(`${base}.name`) : recipe.name,
    description: has('description')
      ? t(`${base}.description`)
      : recipe.description,
    details: has('details') ? t(`${base}.details`) : recipe.details,
    notes: has('notes')
      ? (t(`${base}.notes`, { returnObjects: true }) as unknown as string[])
      : recipe.notes,
  };
}

export function RecipePicker({ protocol, onPick }: Props) {
  const { t } = useTranslation();
  const recipes = recipesForProtocol(protocol);
  const [picked, setPicked] = useState<string | null>(null);

  if (recipes.length === 0) {
    return null;
  }

  const pickedRecipe = recipes.find((r) => r.id === picked);

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="flex-end">
        <Stack gap={0}>
          <Text fw={600} size="sm">
            {t('recipes.title')}
          </Text>
          <Text size="xs" c="dimmed">
            {t('recipes.subtitle')}
          </Text>
        </Stack>
        {picked && (
          <Badge variant="light" color="teal" leftSection={<IconCheck size={11} />}>
            {t('recipes.appliedBadge')}
          </Badge>
        )}
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xs">
        {recipes.map((r) => (
          <RecipeCard
            key={r.id}
            recipe={r}
            active={picked === r.id}
            onClick={() => {
              setPicked(r.id);
              onPick(r);
            }}
          />
        ))}
      </SimpleGrid>

      {picked && pickedRecipe && <AppliedAlert recipe={pickedRecipe} />}
    </Stack>
  );
}

function AppliedAlert({ recipe }: { recipe: Recipe }) {
  const { t } = useTranslation();
  const text = useRecipeText(recipe);
  return (
    <Alert color="teal" variant="light" icon={<IconCheck size={16} />}>
      <Stack gap={4}>
        <Text size="xs" fw={500}>
          {t('recipes.appliedAlert', { name: text.name })}
        </Text>
        {text.notes?.map((n, i) => (
          <Text key={i} size="xs">
            • {n}
          </Text>
        ))}
      </Stack>
    </Alert>
  );
}

function RecipeCard({
  recipe,
  active,
  onClick,
}: {
  recipe: Recipe;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const text = useRecipeText(recipe);
  return (
    <Tooltip
      label={text.details}
      multiline
      w={320}
      withArrow
      openDelay={400}
    >
      <Card
        withBorder
        p="sm"
        radius="sm"
        style={{
          cursor: 'pointer',
          borderColor: active ? 'var(--mantine-color-teal-6)' : undefined,
          backgroundColor: active
            ? 'var(--mantine-color-teal-light)'
            : undefined,
        }}
        onClick={onClick}
      >
        <Group gap={6} align="flex-start" wrap="nowrap">
          <Text size="xl" lh={1}>
            {recipe.emoji}
          </Text>
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600} size="sm" lh={1.2}>
              {text.name}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={2}>
              {text.description}
            </Text>
            <Group gap={6} mt={4}>
              <StarRating
                label={t('recipes.dpiLabel')}
                value={recipe.dpiResistance}
                color="violet"
              />
              <StarRating
                label={t('recipes.speedLabel')}
                value={recipe.speed}
                color="orange"
              />
            </Group>
          </Stack>
        </Group>
      </Card>
    </Tooltip>
  );
}

function StarRating({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Group gap={1}>
      <Text size="xs" c="dimmed" fw={500} mr={2}>
        {label}
      </Text>
      {[1, 2, 3, 4, 5].map((i) =>
        i <= value ? (
          <IconStarFilled
            key={i}
            size={9}
            style={{ color: `var(--mantine-color-${color}-6)` }}
          />
        ) : (
          <IconStar key={i} size={9} style={{ color: 'var(--mantine-color-gray-5)' }} />
        ),
      )}
    </Group>
  );
}
