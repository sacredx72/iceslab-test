import { Menu, UnstyledButton, Text } from '@mantine/core';
import { IconLanguage } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

const LANGS = [
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
] as const;

/**
 * Compact language picker for the topbar - flag + 2-letter code, opens
 * dropdown with full names. Persists to localStorage via i18next's
 * LanguageDetector cache.
 */
export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current =
    LANGS.find((l) => l.code === i18n.resolvedLanguage) ?? LANGS[0];

  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <UnstyledButton
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          <IconLanguage size={16} style={{ color: 'var(--mantine-color-dimmed)' }} />
          <Text size="sm">{current.flag}</Text>
          <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
            {current.code}
          </Text>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {LANGS.map((l) => (
          <Menu.Item
            key={l.code}
            onClick={() => i18n.changeLanguage(l.code)}
            leftSection={l.flag}
            rightSection={
              i18n.resolvedLanguage === l.code ? (
                <Text size="xs" c="teal">
                  ✓
                </Text>
              ) : null
            }
          >
            {l.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
