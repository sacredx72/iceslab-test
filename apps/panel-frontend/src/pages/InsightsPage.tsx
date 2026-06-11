import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Card,
  Center,
  Group,
  Loader,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { IconClockHour4, IconDevices2, IconRss } from '@tabler/icons-react';
import { getInsights, type Insights } from '../lib/api';
import { PageHero } from '../components/PageHero';

const HAIRLINE = '#1C2A3D';
const CARD = '#0F1A28';
const SNOW = '#C8D4E3';
const MIST = '#7A8BA3';
const CYAN = '#7DD3FC';
const MOSS = '#A7D8B9';
const AMBER = '#F5B14C';
const VIOLET = '#A78BFA';

const cardStyle = { backgroundColor: CARD, borderColor: HAIRLINE };

const MONO_LABEL = {
  fontFamily: "'Geist Mono', monospace",
  fontSize: 10,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: MIST,
};

// A stat box: big number + mono caption. Mirrors the dashboard's TrafficStat
// look without importing it (that one is traffic-byte specific).
function Stat({ value, label, accent = SNOW }: { value: string | number; label: string; accent?: string }) {
  return (
    <Stack gap={2}>
      <Text style={{ fontFamily: "'Space Grotesk', Inter, sans-serif", fontSize: 26, fontWeight: 500, color: accent, lineHeight: 1 }}>
        {value}
      </Text>
      <Text style={MONO_LABEL}>{label}</Text>
    </Stack>
  );
}

// Horizontal labelled bar (client breakdown / device distribution). `frac` is
// 0..1 relative to the largest row so the longest bar fills the track.
function LabelBar({ label, value, frac, color }: { label: string; value: string; frac: number; color: string }) {
  return (
    <Stack gap={4}>
      <Group justify="space-between" gap="xs">
        <Text size="sm" style={{ color: SNOW }}>
          {label}
        </Text>
        <Text size="sm" style={{ color: MIST, fontFamily: "'Geist Mono', monospace" }}>
          {value}
        </Text>
      </Group>
      <Box style={{ height: 6, borderRadius: 3, backgroundColor: HAIRLINE, overflow: 'hidden' }}>
        <Box style={{ height: '100%', width: `${Math.max(2, frac * 100)}%`, backgroundColor: color, borderRadius: 3 }} />
      </Box>
    </Stack>
  );
}

// 24-bar hour-of-day histogram. Fixed 24 columns; bar height is fraction of the
// busiest hour. Hour ticks at 0/6/12/18 keep the axis readable.
function HourHistogram({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  return (
    <Box>
      <Group gap={3} align="flex-end" style={{ height: 72 }} wrap="nowrap">
        {data.map((v, h) => (
          <Box
            key={h}
            title={`${String(h).padStart(2, '0')}:00 UTC - ${v}`}
            style={{
              flex: 1,
              height: `${Math.max(3, (v / max) * 100)}%`,
              backgroundColor: v === 0 ? HAIRLINE : CYAN,
              borderRadius: 2,
              minWidth: 4,
            }}
          />
        ))}
      </Group>
      <Group justify="space-between" mt={6}>
        {['00', '06', '12', '18', '23'].map((t) => (
          <Text key={t} style={{ ...MONO_LABEL, fontSize: 9 }}>
            {t}
          </Text>
        ))}
      </Group>
    </Box>
  );
}

export function InsightsPage() {
  const { t } = useTranslation();
  const [days, setDays] = useState(7);

  const { data, isLoading } = useQuery<Insights>({
    queryKey: ['insights', days],
    queryFn: () => getInsights(days),
    staleTime: 60_000,
  });

  return (
    <Box>
      <PageHero
        eyebrow={t('pageHero.insightsEyebrow')}
        title={t('pageHero.insightsTitle')}
        subtitle={t('pageHero.insightsSubtitle')}
        right={
          <SegmentedControl
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            data={[
              { value: '7', label: t('insights.window7d') },
              { value: '30', label: t('insights.window30d') },
              { value: '90', label: t('insights.window90d') },
            ]}
          />
        }
      />

      {isLoading || !data ? (
        <Center style={{ height: 240 }}>
          <Loader color={CYAN} />
        </Center>
      ) : (
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
          {/* ───── SRH Inspector (K1-b) ───── */}
          <Card withBorder padding="lg" radius="md" style={cardStyle}>
            <Group gap="xs" mb="md">
              <ThemeIcon size={28} radius="md" variant="light" style={{ backgroundColor: `${CYAN}1A`, color: CYAN, border: `1px solid ${CYAN}33` }}>
                <IconRss size={16} />
              </ThemeIcon>
              <Stack gap={0}>
                <Text fw={600} style={{ color: SNOW }}>
                  {t('insights.srrTitle')}
                </Text>
                <Text size="xs" style={{ color: MIST }}>
                  {t('insights.srrSubtitle')}
                </Text>
              </Stack>
            </Group>

            <Group gap={48} mb="lg">
              <Stat value={data.subRequests.total.toLocaleString()} label={t('insights.totalRequests')} accent={CYAN} />
              <Stat value={data.subRequests.uniqueUsers.toLocaleString()} label={t('insights.uniqueUsers')} />
            </Group>

            {data.subRequests.total === 0 ? (
              <Text size="sm" style={{ color: MIST }}>
                {t('insights.noRequests')}
              </Text>
            ) : (
              <Stack gap="lg">
                <Stack gap="xs">
                  <Group gap={6}>
                    <IconDevices2 size={13} color={MIST} />
                    <Text style={MONO_LABEL}>{t('insights.byClient')}</Text>
                  </Group>
                  {data.subRequests.byClient.slice(0, 8).map((c) => (
                    <LabelBar
                      key={c.client}
                      label={c.client}
                      value={c.count.toLocaleString()}
                      frac={c.count / data.subRequests.byClient[0].count}
                      color={CYAN}
                    />
                  ))}
                </Stack>

                <Stack gap="xs">
                  <Group gap={6}>
                    <IconClockHour4 size={13} color={MIST} />
                    <Text style={MONO_LABEL}>{t('insights.byHour')}</Text>
                  </Group>
                  <HourHistogram data={data.subRequests.byHourUtc} />
                </Stack>
              </Stack>
            )}
          </Card>

          {/* ───── HWID Inspector (K1-c) ───── */}
          <Card withBorder padding="lg" radius="md" style={cardStyle}>
            <Group gap="xs" mb="md">
              <ThemeIcon size={28} radius="md" variant="light" style={{ backgroundColor: `${VIOLET}1A`, color: VIOLET, border: `1px solid ${VIOLET}33` }}>
                <IconDevices2 size={16} />
              </ThemeIcon>
              <Stack gap={0}>
                <Text fw={600} style={{ color: SNOW }}>
                  {t('insights.hwidTitle')}
                </Text>
                <Text size="xs" style={{ color: MIST }}>
                  {t('insights.hwidSubtitle')}
                </Text>
              </Stack>
            </Group>

            <SimpleGrid cols={2} spacing="lg" mb="lg">
              <Stat value={data.hwid.totalDevices.toLocaleString()} label={t('insights.totalDevices')} accent={VIOLET} />
              <Stat value={data.hwid.usersWithDevices.toLocaleString()} label={t('insights.usersWithDevices')} />
              <Stat value={data.hwid.avgDevicesPerUser.toFixed(2)} label={t('insights.avgPerUser')} accent={MOSS} />
              <Stat
                value={data.hwid.atOrOverLimit.toLocaleString()}
                label={t('insights.atLimit')}
                accent={data.hwid.atOrOverLimit > 0 ? AMBER : SNOW}
              />
            </SimpleGrid>

            {data.hwid.totalDevices === 0 ? (
              <Text size="sm" style={{ color: MIST }}>
                {t('insights.noDevices')}
              </Text>
            ) : (
              <Stack gap="xs">
                <Text style={MONO_LABEL}>{t('insights.distribution')}</Text>
                {data.hwid.distribution.map((d) => {
                  const maxUsers = Math.max(1, ...data.hwid.distribution.map((x) => x.users));
                  return (
                    <LabelBar
                      key={d.bucket}
                      label={t('insights.devicesBucket', { bucket: d.bucket })}
                      value={t('insights.usersCount', { count: d.users })}
                      frac={d.users / maxUsers}
                      color={VIOLET}
                    />
                  );
                })}
              </Stack>
            )}
          </Card>
        </SimpleGrid>
      )}
    </Box>
  );
}
