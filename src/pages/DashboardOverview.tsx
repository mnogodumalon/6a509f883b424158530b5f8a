import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBuchungen } from '@/lib/enrich';
import type { EnrichedBuchungen } from '@/types/enriched';
import type { Kursplan } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { formatDate, lookupKey } from '@/lib/formatters';
import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import {
  IconAlertCircle, IconTool, IconRefresh, IconCheck,
  IconCalendar, IconUsers, IconClockHour4, IconCircleCheck,
  IconAlertTriangle, IconPlus,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { StatCard, StatCardRow } from '@/components/StatCard';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { AI_PHOTO_SCAN } from '@/config/ai-features';
import {
  KanbanWidget, KanbanSkeleton, KanbanError,
  type KanbanCard, type KanbanColumn,
} from '@/components/widgets/KanbanWidget';
import {
  ChartWidget, ChartSkeleton, ChartError,
  type ChartRow,
} from '@/components/widgets/ChartWidget';
import {
  RecordOverlay, RecordHeader, RecordSection, RecordField,
  RecordAttachments, useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import { KursplanDialog } from '@/components/dialogs/KursplanDialog';
import { BuchungenDialog } from '@/components/dialogs/BuchungenDialog';

const APPGROUP_ID = '6a509f883b424158530b5f8a';
const REPAIR_ENDPOINT = '/claude/build/repair';

// Kanban columns come from the schema
const KURS_COLUMNS: KanbanColumn[] = (LOOKUP_OPTIONS['kursplan']?.['kurs_status'] ?? []).map(o => ({
  key: o.key,
  label: o.label,
}));

function toneForKursStatus(status: string | undefined): KanbanCard['tone'] {
  if (status === 'findet_statt') return 'success';
  if (status === 'abgesagt') return 'destructive';
  return 'default';
}

export default function DashboardOverview() {
  const {
    kursplan, setKursplan, buchungen, setBuchungen,
    kursplanMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const enrichedBuchungen = enrichBuchungen(buchungen, { kursplanMap });

  // Dialog state
  const [kursCreateOpen, setKursCreateOpen] = useState(false);
  const [kursEditRecord, setKursEditRecord] = useState<Kursplan | null>(null);
  const [buchungCreateOpen, setBuchungCreateOpen] = useState(false);
  const [buchungEditRecord, setBuchungEditRecord] = useState<EnrichedBuchungen | null>(null);
  const [kursCreateDefaults, setKursCreateDefaults] = useState<Record<string, unknown>>({});

  // Overlay stack
  const overlay = useRecordOverlayStack<{ type: 'kurs' | 'buchung'; id: string }>();

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Derived: today's date key
  const todayKey = format(clock, 'yyyy-MM-dd');

  // Buchungen heute
  const heutigeBuchungen = useMemo(
    () => enrichedBuchungen.filter(b => {
      const d = b.fields.kursdatum ?? '';
      return d.slice(0, 10) === todayKey && lookupKey(b.fields.buchungsstatus) !== 'storniert';
    }),
    [enrichedBuchungen, todayKey],
  );

  // Buchungen auf Warteliste
  const warteliste = useMemo(
    () => enrichedBuchungen.filter(b => lookupKey(b.fields.buchungsstatus) === 'warteliste'),
    [enrichedBuchungen],
  );

  // Kurse nach Status
  const aktivKurse = useMemo(
    () => kursplan.filter(k => lookupKey(k.fields.kurs_status) === 'findet_statt'),
    [kursplan],
  );
  const abgesagteKurse = useMemo(
    () => kursplan.filter(k => lookupKey(k.fields.kurs_status) === 'abgesagt'),
    [kursplan],
  );

  // Kanban: cards from kursplan
  const kanbanCards = useMemo<KanbanCard[]>(
    () => kursplan
      .filter(k => !statusFilter || lookupKey(k.fields.kurs_status) === statusFilter)
      .map(k => {
        const status = lookupKey(k.fields.kurs_status) ?? KURS_COLUMNS[0]?.key ?? '';
        const buchCount = buchungen.filter(b => {
          const id = b.fields.kurs?.match?.(/([a-f0-9]{24})$/i)?.[1];
          return id === k.record_id && lookupKey(b.fields.buchungsstatus) === 'gebucht';
        }).length;
        return {
          id: `kurs:${k.record_id}`,
          column: status,
          title: k.fields.kursname?.label ?? '—',
          subtitle: `${k.fields.wochentag?.label ?? ''} ${k.fields.uhrzeit ?? ''} · ${k.fields.raum ?? ''} · ${buchCount}/${k.fields.max_plaetze ?? '?'} gebucht`,
          tone: toneForKursStatus(status),
        };
      }),
    [kursplan, buchungen, statusFilter],
  );

  // Chart rows: all enriched Buchungen
  const chartRows = useMemo<ChartRow<EnrichedBuchungen>[]>(
    () => enrichedBuchungen.map(b => ({ id: `buchung:${b.record_id}`, data: b })),
    [enrichedBuchungen],
  );

  // Hero: abgesagte Kurse
  const abgesagteHeute = useMemo(
    () => abgesagteKurse.filter(k => {
      const w = lookupKey(k.fields.wochentag);
      const weekday = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'][clock.getDay()];
      return w === weekday;
    }),
    [abgesagteKurse, clock],
  );

  // Advance Kurs status: abgesagt → findet_statt
  const reactiveKurs = useCallback(async (k: Kursplan) => {
    const prev = k.fields.kurs_status;
    setKursplan(ks => ks.map(x => x.record_id === k.record_id
      ? { ...x, fields: { ...x.fields, kurs_status: { key: 'findet_statt', label: 'Findet statt' } } }
      : x
    ));
    try {
      await LivingAppsService.updateKursplanEntry(k.record_id, { kurs_status: 'findet_statt' });
      undoToast(`${k.fields.kursname?.label ?? 'Kurs'} wieder aktiviert.`, async () => {
        setKursplan(ks => ks.map(x => x.record_id === k.record_id
          ? { ...x, fields: { ...x.fields, kurs_status: prev } }
          : x
        ));
        await LivingAppsService.updateKursplanEntry(k.record_id, { kurs_status: prev?.key ?? 'abgesagt' });
      });
    } catch {
      fetchAll();
    }
  }, [setKursplan, fetchAll]);

  // Kurs card move (status change)
  const moveKursCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const kurs = kursplan.find(k => k.record_id === rid);
    if (!kurs) return;
    const prev = kurs.fields.kurs_status;
    setKursplan(prev => prev.map(k => k.record_id === rid
      ? { ...k, fields: { ...k.fields, kurs_status: { key: newColumn, label: newColumn } } }
      : k
    ));
    try {
      await LivingAppsService.updateKursplanEntry(rid, { kurs_status: newColumn });
      undoToast(
        `Status geändert zu "${KURS_COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn}".`,
        async () => {
          setKursplan(ks => ks.map(k => k.record_id === rid
            ? { ...k, fields: { ...k.fields, kurs_status: prev } }
            : k
          ));
          await LivingAppsService.updateKursplanEntry(rid, { kurs_status: prev?.key ?? newColumn });
        },
      );
    } catch {
      fetchAll();
    }
  }, [kursplan, setKursplan, fetchAll]);

  // Confirm Buchung (Warteliste → Gebucht)
  const confirmBuchung = useCallback(async (b: EnrichedBuchungen) => {
    const prev = b.fields.buchungsstatus;
    setBuchungen(bs => bs.map(x => x.record_id === b.record_id
      ? { ...x, fields: { ...x.fields, buchungsstatus: { key: 'gebucht', label: 'Gebucht' } } }
      : x
    ));
    try {
      await LivingAppsService.updateBuchungenEntry(b.record_id, { buchungsstatus: 'gebucht' });
      undoToast(`${b.fields.vorname ?? ''} ${b.fields.nachname ?? ''} bestätigt.`, async () => {
        setBuchungen(bs => bs.map(x => x.record_id === b.record_id
          ? { ...x, fields: { ...x.fields, buchungsstatus: prev } }
          : x
        ));
        await LivingAppsService.updateBuchungenEntry(b.record_id, { buchungsstatus: prev?.key ?? 'warteliste' });
      });
    } catch {
      fetchAll();
    }
  }, [setBuchungen, fetchAll]);

  // Overlay lookup
  const overlayKurs = overlay.top?.type === 'kurs'
    ? kursplan.find(k => k.record_id === overlay.top!.id)
    : undefined;
  const overlayBuchung = overlay.top?.type === 'buchung'
    ? enrichedBuchungen.find(b => b.record_id === overlay.top!.id)
    : undefined;

  // Context line
  const contextLine = useMemo(() => {
    if (heutigeBuchungen.length === 0) return 'Heute noch keine Buchungen.';
    const names = heutigeBuchungen.map(b => `${b.fields.vorname ?? ''} ${b.fields.nachname ?? ''}`.trim()).filter(Boolean);
    return `Heute ${heutigeBuchungen.length === 1 ? 'kommt' : 'kommen'} ${namen(names)} zum Kurs.`;
  }, [heutigeBuchungen]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const heroNode = abgesagteHeute.length > 0 ? (
    <HeroBanner
      tone="warning"
      icon={<IconAlertTriangle size={18} />}
      action={{
        label: 'Wieder aktivieren',
        onClick: () => reactiveKurs(abgesagteHeute[0]),
      }}
    >
      <b>{namen(abgesagteHeute.map(k => k.fields.kursname?.label ?? ''))}</b>
      {abgesagteHeute.length === 1 ? ' ist heute abgesagt' : ' sind heute abgesagt'} — Teilnehmer informieren?
    </HeroBanner>
  ) : null;

  return (
    <>
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{contextLine}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setBuchungCreateOpen(true)}>
            <IconUsers size={14} className="mr-1 shrink-0" />
            Neue Buchung
          </Button>
          <Button size="sm" onClick={() => { setKursCreateDefaults({}); setKursCreateOpen(true); }}>
            <IconPlus size={14} className="mr-1 shrink-0" />
            Neuer Kurs
          </Button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroNode}
        kpis={
          <StatCardRow>
            <StatCard
              title="Aktive Kurse"
              value={aktivKurse.length}
              description={aktivKurse.length === 0 ? 'Noch keine Kurse angelegt' : 'Finden statt'}
              icon={<IconCircleCheck size={18} className="text-muted-foreground" />}
              tone={aktivKurse.length > 0 ? 'success' : 'default'}
              onClick={() => setStatusFilter(f => f === 'findet_statt' ? null : 'findet_statt')}
              active={statusFilter === 'findet_statt'}
            />
            <StatCard
              title="Abgesagte Kurse"
              value={abgesagteKurse.length}
              description={abgesagteKurse.length > 0 ? 'Brauchen Aufmerksamkeit' : 'Alles im Plan'}
              icon={<IconAlertCircle size={18} className="text-muted-foreground" />}
              tone={abgesagteKurse.length > 0 ? 'warning' : 'default'}
              onClick={() => setStatusFilter(f => f === 'abgesagt' ? null : 'abgesagt')}
              active={statusFilter === 'abgesagt'}
            />
            <StatCard
              title="Buchungen heute"
              value={heutigeBuchungen.length}
              description={heutigeBuchungen.length === 0 ? 'Kein Kurs heute' : 'Bestätigte Plätze'}
              icon={<IconCalendar size={18} className="text-muted-foreground" />}
              tone="default"
            />
            <StatCard
              title="Warteliste"
              value={warteliste.length}
              description={warteliste.length > 0 ? 'Warten auf Bestätigung' : 'Warteliste leer'}
              icon={<IconClockHour4 size={18} className="text-muted-foreground" />}
              tone={warteliste.length > 0 ? 'warning' : 'default'}
            />
          </StatCardRow>
        }
        primary={
          <KanbanWidget
            cards={kanbanCards}
            columns={KURS_COLUMNS}
            onCardClick={card => overlay.replace({ type: 'kurs', id: card.id.split(':')[1] ?? '' })}
            onCardMove={moveKursCard}
            onAddCard={column => {
              setKursCreateDefaults({ kurs_status: column });
              setKursCreateOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title="Heute gebucht"
              icon={<IconCalendar size={14} />}
              items={heutigeBuchungen.map(b => ({
                id: b.record_id,
                title: `${b.fields.vorname ?? ''} ${b.fields.nachname ?? ''}`.trim() || '—',
                secondLine: (
                  <>
                    <span className={lookupKey(b.fields.buchungsstatus) === 'warteliste' ? 'font-medium text-amber-600' : 'text-muted-foreground'}>
                      {b.fields.buchungsstatus?.label ?? '—'}
                    </span>
                    {b.kursName ? <span className="text-muted-foreground"> · {b.kursName}</span> : null}
                  </>
                ),
                action: lookupKey(b.fields.buchungsstatus) === 'warteliste'
                  ? { label: '✓ Bestätigen', onClick: () => confirmBuchung(b) }
                  : undefined,
              }))}
              onItemClick={id => overlay.replace({ type: 'buchung', id })}
              empty={{
                text: 'Heute keine Buchungen.',
                action: { label: 'Buchung anlegen', onClick: () => setBuchungCreateOpen(true) },
              }}
            />
            <div className="min-h-0">
              {chartRows.length === 0 ? (
                <ChartSkeleton />
              ) : (
                <ChartWidget
                  title="Buchungen pro Kurs"
                  rows={chartRows}
                  dimension={{
                    kind: 'category',
                    accessor: r => r.data.kursName || 'Unbekannt',
                  }}
                />
              )}
            </div>
          </>
        }
      />

      {/* Kursplan Overlay */}
      <RecordOverlay
        open={overlay.open && overlay.top?.type === 'kurs'}
        onClose={overlay.close}
        onEdit={overlayKurs ? () => { setKursEditRecord(overlayKurs); overlay.close(); } : undefined}
        ariaLabel="Kurs"
        footer={
          overlayKurs && lookupKey(overlayKurs.fields.kurs_status) === 'abgesagt' ? (
            <Button size="sm" className="w-full" onClick={() => { reactiveKurs(overlayKurs); overlay.close(); }}>
              Kurs wieder aktivieren
            </Button>
          ) : overlayKurs && lookupKey(overlayKurs.fields.kurs_status) === 'findet_statt' ? (
            <Button size="sm" variant="outline" className="w-full" onClick={async () => {
              const prev = overlayKurs.fields.kurs_status;
              overlay.close();
              setKursplan(ks => ks.map(k => k.record_id === overlayKurs.record_id
                ? { ...k, fields: { ...k.fields, kurs_status: { key: 'abgesagt', label: 'Abgesagt' } } }
                : k
              ));
              try {
                await LivingAppsService.updateKursplanEntry(overlayKurs.record_id, { kurs_status: 'abgesagt' });
                undoToast(`${overlayKurs.fields.kursname?.label ?? 'Kurs'} abgesagt.`, async () => {
                  setKursplan(ks => ks.map(k => k.record_id === overlayKurs.record_id
                    ? { ...k, fields: { ...k.fields, kurs_status: prev } }
                    : k
                  ));
                  await LivingAppsService.updateKursplanEntry(overlayKurs.record_id, { kurs_status: prev?.key ?? 'findet_statt' });
                });
              } catch { fetchAll(); }
            }}>
              Kurs absagen
            </Button>
          ) : null
        }
      >
        {overlayKurs && (
          <>
            <RecordHeader
              title={overlayKurs.fields.kursname?.label ?? '—'}
              subtitle={overlayKurs.fields.kurs_status?.label}
              badges={
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${lookupKey(overlayKurs.fields.kurs_status) === 'findet_statt' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {overlayKurs.fields.kurs_status?.label ?? '—'}
                </span>
              }
            />
            <RecordSection title="Kursdetails" cols={2}>
              <RecordField label="Trainer/in" value={overlayKurs.fields.trainer?.label} />
              <RecordField label="Wochentag" value={overlayKurs.fields.wochentag?.label} />
              <RecordField label="Uhrzeit" value={overlayKurs.fields.uhrzeit} />
              <RecordField label="Raum" value={overlayKurs.fields.raum} />
              <RecordField label="Max. Plätze" value={overlayKurs.fields.max_plaetze} />
              <RecordField label="Status" value={overlayKurs.fields.kurs_status} format="pill" />
            </RecordSection>
            <RecordSection title="Buchungen für diesen Kurs">
              {buchungen.filter(b => {
                const id = b.fields.kurs?.match?.(/([a-f0-9]{24})$/i)?.[1];
                return id === overlayKurs.record_id;
              }).map(b => (
                <div
                  key={b.record_id}
                  className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 cursor-pointer hover:bg-muted/30 rounded px-1 transition-colors"
                  onClick={() => overlay.push({ type: 'buchung', id: b.record_id })}
                >
                  <span className="text-sm">{b.fields.vorname ?? ''} {b.fields.nachname ?? ''}</span>
                  <span className="text-xs text-muted-foreground">{b.fields.buchungsstatus?.label ?? '—'} · {formatDate(b.fields.kursdatum)}</span>
                </div>
              ))}
              {buchungen.filter(b => {
                const id = b.fields.kurs?.match?.(/([a-f0-9]{24})$/i)?.[1];
                return id === overlayKurs.record_id;
              }).length === 0 && (
                <p className="text-sm text-muted-foreground">Noch keine Buchungen für diesen Kurs.</p>
              )}
            </RecordSection>
            <RecordAttachments appId={APP_IDS.KURSPLAN} recordId={overlayKurs.record_id} />
          </>
        )}
      </RecordOverlay>

      {/* Buchung Overlay */}
      <RecordOverlay
        open={overlay.open && overlay.top?.type === 'buchung'}
        onClose={overlay.close}
        onBack={overlay.canGoBack ? overlay.pop : undefined}
        onEdit={overlayBuchung ? () => { setBuchungEditRecord(overlayBuchung); overlay.close(); } : undefined}
        ariaLabel="Buchung"
        footer={
          overlayBuchung && lookupKey(overlayBuchung.fields.buchungsstatus) === 'warteliste' ? (
            <Button size="sm" className="w-full" onClick={() => { confirmBuchung(overlayBuchung); overlay.close(); }}>
              ✓ Buchung bestätigen
            </Button>
          ) : null
        }
      >
        {overlayBuchung && (
          <>
            <RecordHeader
              title={`${overlayBuchung.fields.vorname ?? ''} ${overlayBuchung.fields.nachname ?? ''}`.trim() || '—'}
              subtitle={overlayBuchung.kursName}
            />
            <RecordSection title="Buchungsdetails" cols={2}>
              <RecordField label="Vorname" value={overlayBuchung.fields.vorname} />
              <RecordField label="Nachname" value={overlayBuchung.fields.nachname} />
              <RecordField label="E-Mail" value={overlayBuchung.fields.email} format="email" />
              <RecordField label="Kurs" value={overlayBuchung.kursName} />
              <RecordField label="Kursdatum" value={overlayBuchung.fields.kursdatum} format="date" />
              <RecordField label="Status" value={overlayBuchung.fields.buchungsstatus} format="pill" />
            </RecordSection>
            <RecordAttachments appId={APP_IDS.BUCHUNGEN} recordId={overlayBuchung.record_id} />
          </>
        )}
      </RecordOverlay>

      {/* Dialogs */}
      <KursplanDialog
        open={kursCreateOpen || kursEditRecord !== null}
        onClose={() => { setKursCreateOpen(false); setKursEditRecord(null); setKursCreateDefaults({}); }}
        onSubmit={async (fields) => {
          if (kursEditRecord) {
            await LivingAppsService.updateKursplanEntry(kursEditRecord.record_id, fields);
          } else {
            await LivingAppsService.createKursplanEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={kursEditRecord?.fields ?? kursCreateDefaults}
        recordId={kursEditRecord?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Kursplan']}
      />

      <BuchungenDialog
        open={buchungCreateOpen || buchungEditRecord !== null}
        onClose={() => { setBuchungCreateOpen(false); setBuchungEditRecord(null); }}
        onSubmit={async (fields) => {
          if (buchungEditRecord) {
            await LivingAppsService.updateBuchungenEntry(buchungEditRecord.record_id, fields);
          } else {
            await LivingAppsService.createBuchungenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={buchungEditRecord?.fields}
        recordId={buchungEditRecord?.record_id}
        kursplanList={kursplan}
        enablePhotoScan={AI_PHOTO_SCAN['Buchungen']}
      />
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

function DashboardError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [repairing, setRepairing] = useState(false);
  const [repairStatus, setRepairStatus] = useState('');
  const [repairDone, setRepairDone] = useState(false);
  const [repairFailed, setRepairFailed] = useState(false);

  const handleRepair = async () => {
    setRepairing(true);
    setRepairStatus('Reparatur wird gestartet...');
    setRepairFailed(false);

    const errorContext = JSON.stringify({
      type: 'data_loading',
      message: error.message,
      stack: (error.stack ?? '').split('\n').slice(0, 10).join('\n'),
      url: window.location.href,
    });

    try {
      const resp = await fetch(REPAIR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, error_context: errorContext }),
      });

      if (!resp.ok || !resp.body) {
        setRepairing(false);
        setRepairFailed(true);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data: ')) continue;
          const content = line.slice(6);
          if (content.startsWith('[STATUS]')) {
            setRepairStatus(content.replace(/^\[STATUS]\s*/, ''));
          }
          if (content.startsWith('[DONE]')) {
            setRepairDone(true);
            setRepairing(false);
          }
          if (content.startsWith('[ERROR]') && !content.includes('Dashboard-Links')) {
            setRepairFailed(true);
          }
        }
      }
    } catch {
      setRepairing(false);
      setRepairFailed(true);
    }
  };

  if (repairDone) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
          <IconCheck size={22} className="text-green-500" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-foreground mb-1">Dashboard repariert</h3>
          <p className="text-sm text-muted-foreground max-w-xs">Das Problem wurde behoben. Bitte laden Sie die Seite neu.</p>
        </div>
        <Button size="sm" onClick={() => window.location.reload()}>
          <IconRefresh size={14} className="mr-1" />Neu laden
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <IconAlertCircle size={22} className="text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {repairing ? repairStatus : error.message}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry} disabled={repairing}>Erneut versuchen</Button>
        <Button size="sm" onClick={handleRepair} disabled={repairing}>
          {repairing
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1" />
            : <IconTool size={14} className="mr-1" />}
          {repairing ? 'Reparatur läuft...' : 'Dashboard reparieren'}
        </Button>
      </div>
      {repairFailed && <p className="text-sm text-destructive">Automatische Reparatur fehlgeschlagen. Bitte kontaktieren Sie den Support.</p>}
    </div>
  );
}
