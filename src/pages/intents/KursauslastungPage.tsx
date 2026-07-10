import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { StatusBadge } from '@/components/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import type { Kursplan, Buchungen } from '@/types/app';
import { Button } from '@/components/ui/button';
import {
  IconCheck,
  IconX,
  IconCalendar,
  IconUsers,
  IconArrowLeft,
  IconRefresh,
  IconLoader2,
} from '@tabler/icons-react';

const STEPS = [
  { label: 'Kurs wählen' },
  { label: 'Buchungen' },
  { label: 'Zusammenfassung' },
];

// Valid buchungsstatus keys from LOOKUP_OPTIONS
const STATUS_GEBUCHT = 'gebucht';
const STATUS_WARTELISTE = 'warteliste';
const STATUS_STORNIERT = 'storniert';

type FilterTab = 'alle' | typeof STATUS_GEBUCHT | typeof STATUS_WARTELISTE | typeof STATUS_STORNIERT;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: STATUS_GEBUCHT, label: 'Gebucht' },
  { key: STATUS_WARTELISTE, label: 'Warteliste' },
  { key: STATUS_STORNIERT, label: 'Storniert' },
];

export default function KursauslastungPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { kursplan, buchungen, loading, error, fetchAll, kursplanMap } = useDashboardData();

  const [step, setStep] = useState<number>(1);
  const [selectedKursId, setSelectedKursId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('alle');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [updatingRows, setUpdatingRows] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Initialize from URL params
  useEffect(() => {
    const urlKursId = searchParams.get('kursId');
    const urlStep = parseInt(searchParams.get('step') ?? '', 10);
    if (urlKursId) {
      setSelectedKursId(urlKursId);
      if (!isNaN(urlStep) && urlStep >= 2 && urlStep <= 3) {
        setStep(urlStep);
      } else {
        setStep(2);
      }
    } else if (!isNaN(urlStep) && urlStep >= 1 && urlStep <= 3) {
      setStep(urlStep);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync step and kursId to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (step > 1) {
      params.set('step', String(step));
    } else {
      params.delete('step');
    }
    if (selectedKursId) {
      params.set('kursId', selectedKursId);
    } else {
      params.delete('kursId');
    }
    setSearchParams(params, { replace: true });
  }, [step, selectedKursId, setSearchParams, searchParams]);

  // Selected kurs record
  const selectedKurs: Kursplan | undefined = useMemo(
    () => (selectedKursId ? kursplanMap.get(selectedKursId) : undefined),
    [selectedKursId, kursplanMap]
  );

  // Buchungen for selected kurs
  const kursBuchungen: Buchungen[] = useMemo(() => {
    if (!selectedKursId) return [];
    return buchungen.filter(b => {
      const id = extractRecordId(b.fields.kurs);
      return id === selectedKursId;
    });
  }, [buchungen, selectedKursId]);

  // Booking counts per kurs for step 1 display
  const buchungenCountByKurs = useMemo(() => {
    const map = new Map<string, number>();
    buchungen.forEach(b => {
      const id = extractRecordId(b.fields.kurs);
      if (id) map.set(id, (map.get(id) ?? 0) + 1);
    });
    return map;
  }, [buchungen]);

  // Filtered buchungen for step 2 table
  const filteredBuchungen = useMemo(() => {
    if (filterTab === 'alle') return kursBuchungen;
    return kursBuchungen.filter(b => b.fields.buchungsstatus?.key === filterTab);
  }, [kursBuchungen, filterTab]);

  // Stats
  const confirmedCount = useMemo(
    () => kursBuchungen.filter(b => b.fields.buchungsstatus?.key === STATUS_GEBUCHT).length,
    [kursBuchungen]
  );
  const wartelisteCount = useMemo(
    () => kursBuchungen.filter(b => b.fields.buchungsstatus?.key === STATUS_WARTELISTE).length,
    [kursBuchungen]
  );
  const storniertCount = useMemo(
    () => kursBuchungen.filter(b => b.fields.buchungsstatus?.key === STATUS_STORNIERT).length,
    [kursBuchungen]
  );
  const maxPlaetze = selectedKurs?.fields.max_plaetze ?? 0;

  const handleSelectKurs = useCallback((id: string) => {
    setSelectedKursId(id);
    setFilterTab('alle');
    setSelectedRows(new Set());
    setStep(2);
  }, []);

  const handleUpdateStatus = useCallback(async (recordId: string, newStatus: string) => {
    setUpdatingRows(prev => new Set(prev).add(recordId));
    try {
      await LivingAppsService.updateBuchungenEntry(recordId, { buchungsstatus: newStatus });
      await fetchAll();
    } finally {
      setUpdatingRows(prev => {
        const next = new Set(prev);
        next.delete(recordId);
        return next;
      });
    }
  }, [fetchAll]);

  const handleBulkUpdate = useCallback(async (newStatus: string) => {
    if (selectedRows.size === 0) return;
    setBulkUpdating(true);
    try {
      await Promise.all(
        Array.from(selectedRows).map(id =>
          LivingAppsService.updateBuchungenEntry(id, { buchungsstatus: newStatus })
        )
      );
      await fetchAll();
      setSelectedRows(new Set());
    } finally {
      setBulkUpdating(false);
    }
  }, [selectedRows, fetchAll]);

  const toggleRowSelection = useCallback((id: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedRows.size === filteredBuchungen.length && filteredBuchungen.length > 0) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredBuchungen.map(b => b.record_id)));
    }
  }, [selectedRows, filteredBuchungen]);

  const handleReset = useCallback(() => {
    setSelectedKursId(null);
    setFilterTab('alle');
    setSelectedRows(new Set());
    setStep(1);
  }, []);

  const handleStepChange = useCallback((newStep: number) => {
    setStep(newStep);
  }, []);

  return (
    <IntentWizardShell
      title="Kursauslastung verwalten"
      subtitle="Kurs auswählen, Buchungen einsehen und Status aktualisieren"
      steps={STEPS}
      currentStep={step}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Kurs auswählen */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Welchen Kurs möchtest du verwalten?</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Wähle einen Kurs aus, um seine Buchungen einzusehen und zu bearbeiten.
            </p>
          </div>
          <EntitySelectStep
            items={kursplan.map(k => ({
              id: k.record_id,
              title: k.fields.kursname?.label ?? k.record_id,
              subtitle: [
                k.fields.trainer?.label,
                k.fields.wochentag?.label,
                k.fields.uhrzeit,
                k.fields.raum ? `Raum ${k.fields.raum}` : undefined,
              ]
                .filter(Boolean)
                .join(' · '),
              status: k.fields.kurs_status
                ? { key: k.fields.kurs_status.key, label: k.fields.kurs_status.label }
                : undefined,
              stats: [
                {
                  label: 'Buchungen',
                  value: buchungenCountByKurs.get(k.record_id) ?? 0,
                },
                {
                  label: 'Max. Plätze',
                  value: k.fields.max_plaetze ?? '–',
                },
              ],
              icon: <IconCalendar size={20} className="text-primary" />,
            }))}
            onSelect={handleSelectKurs}
            searchPlaceholder="Kurs suchen..."
            emptyIcon={<IconCalendar size={32} />}
            emptyText="Keine Kurse gefunden."
          />
        </div>
      )}

      {/* Step 2: Buchungen verwalten */}
      {step === 2 && selectedKurs && (
        <div className="space-y-5">
          {/* Course header */}
          <div className="rounded-2xl border bg-card p-4 overflow-hidden">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold truncate">
                    {selectedKurs.fields.kursname?.label ?? '–'}
                  </h2>
                  {selectedKurs.fields.kurs_status && (
                    <StatusBadge
                      statusKey={selectedKurs.fields.kurs_status.key}
                      label={selectedKurs.fields.kurs_status.label}
                    />
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1 truncate">
                  {[
                    selectedKurs.fields.wochentag?.label,
                    selectedKurs.fields.uhrzeit,
                    selectedKurs.fields.raum ? `Raum ${selectedKurs.fields.raum}` : undefined,
                    selectedKurs.fields.trainer?.label,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold">
                  <IconUsers size={15} />
                  <span>{confirmedCount}</span>
                  <span className="text-primary/60 font-normal">/</span>
                  <span>{maxPlaetze > 0 ? maxPlaetze : '∞'}</span>
                  <span className="text-xs font-normal text-primary/70 ml-0.5">Plätze</span>
                </div>
              </div>
            </div>

            {/* Occupancy bar */}
            {maxPlaetze > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Auslastung</span>
                  <span className="font-medium text-foreground">
                    {Math.round((confirmedCount / maxPlaetze) * 100)}%
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      confirmedCount > maxPlaetze
                        ? 'bg-red-500'
                        : confirmedCount / maxPlaetze >= 0.8
                        ? 'bg-amber-500'
                        : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min((confirmedCount / maxPlaetze) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    Gebucht: <span className="font-medium text-foreground">{confirmedCount}</span>
                  </span>
                  <span>
                    Warteliste: <span className="font-medium text-foreground">{wartelisteCount}</span>
                  </span>
                  <span>
                    Storniert: <span className="font-medium text-foreground">{storniertCount}</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 flex-wrap">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => {
                  setFilterTab(tab.key);
                  setSelectedRows(new Set());
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filterTab === tab.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {tab.label}
                <span className="ml-1.5 text-xs opacity-70">
                  {tab.key === 'alle'
                    ? kursBuchungen.length
                    : kursBuchungen.filter(b => b.fields.buchungsstatus?.key === tab.key).length}
                </span>
              </button>
            ))}
          </div>

          {/* Bulk actions */}
          {selectedRows.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl bg-primary/5 border border-primary/20">
              <span className="text-sm font-medium text-foreground">
                {selectedRows.size} ausgewählt
              </span>
              <div className="flex gap-2 ml-auto">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkUpdate(STATUS_GEBUCHT)}
                  disabled={bulkUpdating}
                  className="gap-1.5"
                >
                  {bulkUpdating ? (
                    <IconLoader2 size={14} className="animate-spin" />
                  ) : (
                    <IconCheck size={14} />
                  )}
                  Ausgewählte bestätigen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkUpdate(STATUS_STORNIERT)}
                  disabled={bulkUpdating}
                  className="gap-1.5 text-destructive hover:text-destructive"
                >
                  {bulkUpdating ? (
                    <IconLoader2 size={14} className="animate-spin" />
                  ) : (
                    <IconX size={14} />
                  )}
                  Ausgewählte stornieren
                </Button>
              </div>
            </div>
          )}

          {/* Buchungen table */}
          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              {filteredBuchungen.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <IconUsers size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Keine Buchungen in dieser Kategorie.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="w-10 px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={
                            filteredBuchungen.length > 0 &&
                            selectedRows.size === filteredBuchungen.length
                          }
                          onChange={toggleSelectAll}
                          className="rounded"
                          aria-label="Alle auswählen"
                        />
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">
                        E-Mail
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">
                        Kursdatum
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredBuchungen.map(b => {
                      const isUpdating = updatingRows.has(b.record_id);
                      const isSelected = selectedRows.has(b.record_id);
                      const name = [b.fields.vorname, b.fields.nachname].filter(Boolean).join(' ') || '–';
                      const statusKey = b.fields.buchungsstatus?.key;

                      return (
                        <tr
                          key={b.record_id}
                          className={`transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRowSelection(b.record_id)}
                              className="rounded"
                              aria-label={`${name} auswählen`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-foreground truncate block max-w-[150px]">
                              {name}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="text-muted-foreground truncate block max-w-[200px]">
                              {b.fields.email ?? '–'}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-muted-foreground">
                              {b.fields.kursdatum
                                ? new Date(b.fields.kursdatum).toLocaleDateString('de-DE', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                  })
                                : '–'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              statusKey={statusKey}
                              label={b.fields.buchungsstatus?.label}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {isUpdating ? (
                                <IconLoader2 size={16} className="animate-spin text-muted-foreground" />
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleUpdateStatus(b.record_id, STATUS_GEBUCHT)}
                                    disabled={statusKey === STATUS_GEBUCHT}
                                    title="Buchen bestätigen"
                                    className="p-1.5 rounded-lg transition-colors text-muted-foreground hover:bg-green-100 hover:text-green-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                    aria-label="Buchung bestätigen"
                                  >
                                    <IconCheck size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleUpdateStatus(b.record_id, STATUS_WARTELISTE)}
                                    disabled={statusKey === STATUS_WARTELISTE}
                                    title="Auf Warteliste setzen"
                                    className="p-1.5 rounded-lg transition-colors text-muted-foreground hover:bg-amber-100 hover:text-amber-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                    aria-label="Auf Warteliste setzen"
                                  >
                                    <IconUsers size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleUpdateStatus(b.record_id, STATUS_STORNIERT)}
                                    disabled={statusKey === STATUS_STORNIERT}
                                    title="Stornieren"
                                    className="p-1.5 rounded-lg transition-colors text-muted-foreground hover:bg-red-100 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                    aria-label="Buchung stornieren"
                                  >
                                    <IconX size={16} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setSelectedKursId(null);
                setStep(1);
              }}
              className="gap-1.5"
            >
              <IconArrowLeft size={15} />
              Zurück zur Kursauswahl
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={fetchAll}
                className="gap-1.5"
              >
                <IconRefresh size={15} />
                Aktualisieren
              </Button>
              <Button
                onClick={() => setStep(3)}
                className="gap-1.5"
              >
                Zusammenfassung ansehen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Zusammenfassung */}
      {step === 3 && selectedKurs && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Zusammenfassung</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Übersicht der Buchungsstatistiken für diesen Kurs.
            </p>
          </div>

          {/* Kurs info card */}
          <div className="rounded-2xl border bg-card p-4 overflow-hidden">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground truncate">
                {selectedKurs.fields.kursname?.label ?? '–'}
              </h3>
              {selectedKurs.fields.kurs_status && (
                <StatusBadge
                  statusKey={selectedKurs.fields.kurs_status.key}
                  label={selectedKurs.fields.kurs_status.label}
                />
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {[
                selectedKurs.fields.wochentag?.label,
                selectedKurs.fields.uhrzeit,
                selectedKurs.fields.raum ? `Raum ${selectedKurs.fields.raum}` : undefined,
                selectedKurs.fields.trainer?.label,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl border bg-card p-4 text-center overflow-hidden">
              <div className="text-3xl font-bold text-foreground">{kursBuchungen.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Buchungen gesamt</div>
            </div>
            <div className="rounded-2xl border bg-card p-4 text-center overflow-hidden">
              <div className="text-3xl font-bold text-emerald-600">{confirmedCount}</div>
              <div className="text-xs text-muted-foreground mt-1">Gebucht</div>
            </div>
            <div className="rounded-2xl border bg-card p-4 text-center overflow-hidden">
              <div className="text-3xl font-bold text-amber-600">{wartelisteCount}</div>
              <div className="text-xs text-muted-foreground mt-1">Warteliste</div>
            </div>
            <div className="rounded-2xl border bg-card p-4 text-center overflow-hidden">
              <div className="text-3xl font-bold text-red-500">{storniertCount}</div>
              <div className="text-xs text-muted-foreground mt-1">Storniert</div>
            </div>
          </div>

          {/* Occupancy */}
          {maxPlaetze > 0 && (
            <div className="rounded-2xl border bg-card p-4 space-y-3 overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Auslastung</span>
                <span className="text-sm font-semibold text-foreground">
                  {confirmedCount} / {maxPlaetze} Plätze
                </span>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    confirmedCount > maxPlaetze
                      ? 'bg-red-500'
                      : confirmedCount / maxPlaetze >= 0.8
                      ? 'bg-amber-500'
                      : 'bg-primary'
                  }`}
                  style={{ width: `${Math.min((confirmedCount / maxPlaetze) * 100, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {Math.round((confirmedCount / maxPlaetze) * 100)}% belegt
                </span>
                <span>
                  {Math.max(maxPlaetze - confirmedCount, 0)} freie Plätze
                </span>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
            <Button
              variant="outline"
              onClick={() => setStep(2)}
              className="gap-1.5"
            >
              <IconArrowLeft size={15} />
              Zurück zu Buchungen
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleReset}
              >
                Weiteren Kurs verwalten
              </Button>
              <Button asChild>
                <a href="#/">Fertig</a>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Fallback: step 2/3 without a selected kurs */}
      {(step === 2 || step === 3) && !selectedKurs && (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted-foreground text-sm">Kein Kurs ausgewählt.</p>
          <Button variant="outline" onClick={() => setStep(1)} className="gap-1.5">
            <IconArrowLeft size={15} />
            Zurück zur Kursauswahl
          </Button>
        </div>
      )}
    </IntentWizardShell>
  );
}
