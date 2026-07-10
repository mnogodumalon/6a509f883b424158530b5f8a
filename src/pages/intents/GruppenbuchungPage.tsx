import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import type { Kursplan } from '@/types/app';
import {
  IconPlus,
  IconTrash,
  IconCheck,
  IconUsers,
  IconCalendar,
  IconAlertTriangle,
  IconRefresh,
} from '@tabler/icons-react';

interface Participant {
  id: string;
  vorname: string;
  nachname: string;
  email: string;
}

const WIZARD_STEPS = [
  { label: 'Kurs wählen' },
  { label: 'Datum & Teilnehmer' },
  { label: 'Bestätigung' },
];

function createEmptyParticipant(): Participant {
  return { id: crypto.randomUUID(), vorname: '', nachname: '', email: '' };
}

export default function GruppenbuchungPage() {
  const { kursplan, buchungen, loading, error, fetchAll } = useDashboardData();
  const [searchParams, setSearchParams] = useSearchParams();

  // Wizard state
  const [step, setStep] = useState<number>(() => {
    const urlStep = parseInt(searchParams.get('step') ?? '', 10);
    return urlStep >= 1 && urlStep <= 3 ? urlStep : 1;
  });

  const [selectedKursId, setSelectedKursId] = useState<string | null>(null);
  const [kursdatum, setKursdatum] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([createEmptyParticipant()]);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitTotal, setSubmitTotal] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Sync step to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (step > 1) {
      params.set('step', String(step));
    } else {
      params.delete('step');
    }
    setSearchParams(params, { replace: true });
  }, [step, searchParams, setSearchParams]);

  // Derived: selected kurs record
  const selectedKurs = useMemo<Kursplan | null>(
    () => kursplan.find(k => k.record_id === selectedKursId) ?? null,
    [kursplan, selectedKursId]
  );

  // Derived: existing bookings for selected kurs
  const existingBookingsCount = useMemo<number>(() => {
    if (!selectedKursId) return 0;
    return buchungen.filter(b => {
      const id = extractRecordId(b.fields.kurs);
      return id === selectedKursId;
    }).length;
  }, [buchungen, selectedKursId]);

  // Derived: valid participants (both vorname and nachname filled)
  const validParticipants = useMemo<Participant[]>(
    () => participants.filter(p => p.vorname.trim() && p.nachname.trim()),
    [participants]
  );

  const maxPlaetze = selectedKurs?.fields.max_plaetze ?? 0;
  const totalAfterBooking = existingBookingsCount + validParticipants.length;
  const isOverCapacity = maxPlaetze > 0 && totalAfterBooking > maxPlaetze;
  const remainingSlots = maxPlaetze > 0 ? Math.max(0, maxPlaetze - existingBookingsCount) : null;

  // Step 2 validity
  const step2Valid = kursdatum.trim() !== '' && validParticipants.length > 0;

  // Participant helpers
  function updateParticipant(id: string, field: keyof Omit<Participant, 'id'>, value: string) {
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }

  function removeParticipant(id: string) {
    setParticipants(prev => prev.filter(p => p.id !== id));
  }

  function addParticipant() {
    setParticipants(prev => [...prev, createEmptyParticipant()]);
  }

  // Step navigation
  function handleKursSelect(id: string) {
    setSelectedKursId(id);
    setStep(2);
  }

  function goToStep3() {
    if (!step2Valid) return;
    setStep(3);
  }

  // Submit
  async function handleSubmit() {
    if (!selectedKursId || !kursdatum || validParticipants.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitProgress(0);
    setSubmitTotal(validParticipants.length);

    const kursUrl = createRecordUrl(APP_IDS.KURSPLAN, selectedKursId);

    let completed = 0;
    const errors: string[] = [];

    for (const p of validParticipants) {
      try {
        await LivingAppsService.createBuchungenEntry({
          vorname: p.vorname.trim(),
          nachname: p.nachname.trim(),
          email: p.email.trim() || undefined,
          kurs: kursUrl,
          kursdatum: kursdatum,
          buchungsstatus: 'gebucht',
        });
        completed++;
        setSubmitProgress(completed);
      } catch (err) {
        errors.push(`${p.vorname} ${p.nachname}: ${err instanceof Error ? err.message : 'Fehler'}`);
      }
    }

    await fetchAll();
    setSubmitting(false);

    if (errors.length > 0) {
      setSubmitError(`${completed} von ${validParticipants.length} Buchungen erstellt. Fehler:\n${errors.join('\n')}`);
    } else {
      setSubmitSuccess(true);
    }
  }

  function handleReset() {
    setSelectedKursId(null);
    setKursdatum('');
    setParticipants([createEmptyParticipant()]);
    setSubmitProgress(0);
    setSubmitTotal(0);
    setSubmitError(null);
    setSubmitSuccess(false);
    setSubmitting(false);
    setStep(1);
  }

  // Kurs display name helper
  function kursDisplayName(k: Kursplan): string {
    const name = k.fields.kursname?.label ?? '';
    const tag = k.fields.wochentag?.label ?? '';
    const uhr = k.fields.uhrzeit ?? '';
    const parts = [tag, uhr].filter(Boolean).join(', ');
    return parts ? `${name} (${parts})` : name;
  }

  return (
    <IntentWizardShell
      title="Gruppenbuchung"
      subtitle="Mehrere Teilnehmer auf einmal in einen Kurs buchen"
      steps={WIZARD_STEPS}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Kurs auswählen ── */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Welchen Kurs möchtest du buchen?</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Wähle einen Kurs aus der Liste.</p>
          </div>
          <EntitySelectStep
            items={kursplan.map(k => ({
              id: k.record_id,
              title: k.fields.kursname?.label ?? k.record_id,
              subtitle: [
                k.fields.trainer?.label,
                k.fields.wochentag?.label,
                k.fields.uhrzeit,
              ].filter(Boolean).join(' · '),
              status: k.fields.kurs_status
                ? { key: k.fields.kurs_status.key, label: k.fields.kurs_status.label }
                : undefined,
              stats: [
                ...(k.fields.raum ? [{ label: 'Raum', value: k.fields.raum }] : []),
                ...(k.fields.max_plaetze != null ? [{ label: 'Max. Plätze', value: k.fields.max_plaetze }] : []),
              ],
              icon: <IconUsers size={20} className="text-primary" />,
            }))}
            onSelect={handleKursSelect}
            searchPlaceholder="Kurs suchen..."
            emptyText="Keine Kurse gefunden."
            emptyIcon={<IconUsers size={32} />}
          />
        </div>
      )}

      {/* ── Step 2: Datum & Teilnehmer ── */}
      {step === 2 && selectedKurs && (
        <div className="space-y-6">
          {/* Selected course header */}
          <div className="flex items-start gap-3 p-4 rounded-xl border bg-card overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <IconUsers size={20} className="text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm truncate">
                  {selectedKurs.fields.kursname?.label ?? ''}
                </span>
                {selectedKurs.fields.kurs_status && (
                  <StatusBadge
                    statusKey={selectedKurs.fields.kurs_status.key}
                    label={selectedKurs.fields.kurs_status.label}
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {[
                  selectedKurs.fields.trainer?.label,
                  selectedKurs.fields.wochentag?.label,
                  selectedKurs.fields.uhrzeit,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            <button
              onClick={() => setStep(1)}
              className="text-xs text-muted-foreground hover:text-foreground shrink-0 underline"
            >
              Ändern
            </button>
          </div>

          {/* Date picker */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <IconCalendar size={16} className="text-muted-foreground" />
              Kursdatum
            </label>
            <Input
              type="date"
              value={kursdatum}
              onChange={e => setKursdatum(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {/* Capacity tracker */}
          {maxPlaetze > 0 && (
            <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${
              isOverCapacity
                ? 'bg-destructive/10 border-destructive/30 text-destructive'
                : 'bg-secondary border-border text-foreground'
            }`}>
              {isOverCapacity
                ? <IconAlertTriangle size={16} className="shrink-0" />
                : <IconUsers size={16} className="text-muted-foreground shrink-0" />
              }
              <span>
                <span className="font-semibold">{totalAfterBooking}</span>
                {' von '}
                <span className="font-semibold">{maxPlaetze}</span>
                {' Plätzen belegt'}
                {remainingSlots !== null && !isOverCapacity && (
                  <span className="text-muted-foreground ml-1">({remainingSlots} frei)</span>
                )}
                {isOverCapacity && (
                  <span className="ml-1 font-medium">— Kapazität überschritten!</span>
                )}
              </span>
            </div>
          )}

          {/* Participants list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">
                Teilnehmer ({participants.length})
              </h3>
            </div>

            <div className="space-y-2">
              {participants.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 p-3 rounded-xl border bg-card overflow-hidden"
                >
                  <span className="text-xs text-muted-foreground w-5 shrink-0 text-center">{idx + 1}</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1 min-w-0">
                    <Input
                      placeholder="Vorname"
                      value={p.vorname}
                      onChange={e => updateParticipant(p.id, 'vorname', e.target.value)}
                      className="h-9 text-sm"
                    />
                    <Input
                      placeholder="Nachname"
                      value={p.nachname}
                      onChange={e => updateParticipant(p.id, 'nachname', e.target.value)}
                      className="h-9 text-sm"
                    />
                    <Input
                      type="email"
                      placeholder="E-Mail (optional)"
                      value={p.email}
                      onChange={e => updateParticipant(p.id, 'email', e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <button
                    onClick={() => removeParticipant(p.id)}
                    disabled={participants.length === 1}
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Teilnehmer entfernen"
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={addParticipant}
              className="w-full gap-2"
            >
              <IconPlus size={15} />
              Teilnehmer hinzufügen
            </Button>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Zurück
            </Button>
            <Button
              onClick={goToStep3}
              disabled={!step2Valid}
            >
              Weiter zur Bestätigung
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Bestätigung & Absenden ── */}
      {step === 3 && selectedKurs && (
        <div className="space-y-6">
          {submitSuccess ? (
            /* Success state */
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center">
                <IconCheck size={28} className="text-green-700" stroke={2.5} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Buchungen erstellt!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {validParticipants.length} {validParticipants.length === 1 ? 'Buchung wurde' : 'Buchungen wurden'} erfolgreich angelegt.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 mt-2">
                <Button onClick={handleReset} variant="outline" className="gap-2">
                  <IconRefresh size={15} />
                  Neue Gruppenbuchung
                </Button>
                <a href="#/">
                  <Button>Zurück zum Dashboard</Button>
                </a>
              </div>
            </div>
          ) : (
            <>
              {/* Summary card */}
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="p-4 border-b bg-secondary/30">
                  <h2 className="text-sm font-semibold text-foreground">Zusammenfassung</h2>
                </div>
                <div className="p-4 space-y-4">
                  {/* Course info */}
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Kurs</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">
                        {kursDisplayName(selectedKurs)}
                      </span>
                      {selectedKurs.fields.kurs_status && (
                        <StatusBadge
                          statusKey={selectedKurs.fields.kurs_status.key}
                          label={selectedKurs.fields.kurs_status.label}
                        />
                      )}
                    </div>
                    {selectedKurs.fields.raum && (
                      <p className="text-xs text-muted-foreground">Raum: {selectedKurs.fields.raum}</p>
                    )}
                  </div>

                  {/* Date */}
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Kursdatum</p>
                    <p className="text-sm font-medium">
                      {kursdatum
                        ? new Date(kursdatum + 'T00:00:00').toLocaleDateString('de-DE', {
                            weekday: 'long',
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                          })
                        : '—'}
                    </p>
                  </div>

                  {/* Participants */}
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      Teilnehmer ({validParticipants.length})
                    </p>
                    <div className="space-y-1.5 overflow-x-auto">
                      {validParticipants.map((p, idx) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-2 text-sm py-1.5 border-b border-border/50 last:border-0"
                        >
                          <span className="text-muted-foreground text-xs w-5 shrink-0">{idx + 1}.</span>
                          <span className="font-medium truncate min-w-0">{p.vorname} {p.nachname}</span>
                          {p.email && (
                            <span className="text-muted-foreground text-xs truncate min-w-0">{p.email}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Capacity warning on step 3 */}
              {isOverCapacity && (
                <div className="flex items-center gap-3 p-3 rounded-xl border bg-destructive/10 border-destructive/30 text-destructive text-sm">
                  <IconAlertTriangle size={16} className="shrink-0" />
                  <span>
                    Achtung: Die Kapazität von {maxPlaetze} Plätzen wird überschritten. Buchung trotzdem möglich.
                  </span>
                </div>
              )}

              {/* Submit error */}
              {submitError && (
                <div className="p-3 rounded-xl border bg-destructive/10 border-destructive/30 text-destructive text-sm whitespace-pre-line">
                  {submitError}
                </div>
              )}

              {/* Submit progress */}
              {submitting && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Buchungen werden erstellt…</span>
                    <span className="font-medium">{submitProgress} von {submitTotal}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: submitTotal > 0 ? `${(submitProgress / submitTotal) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setStep(2)}
                  disabled={submitting}
                >
                  Zurück
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || validParticipants.length === 0}
                  className="gap-2"
                >
                  {submitting ? (
                    <>Wird gebucht…</>
                  ) : (
                    <>
                      <IconCheck size={16} />
                      Jetzt buchen ({validParticipants.length}{' '}
                      {validParticipants.length === 1 ? 'Buchung' : 'Buchungen'})
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
