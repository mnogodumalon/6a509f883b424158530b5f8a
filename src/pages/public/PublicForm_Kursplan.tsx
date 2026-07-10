import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { lookupKey } from '@/lib/formatters';

// Empty PROXY_BASE → relative URLs (dashboard and form-proxy share the domain).
const PROXY_BASE = '';
const APP_ID = '6a509f71578595715144f358';
const SUBMIT_PATH = `/rest/apps/${APP_ID}/records`;
const ALTCHA_SCRIPT_SRC = 'https://cdn.jsdelivr.net/npm/altcha/dist/altcha.min.js';

async function submitPublicForm(fields: Record<string, unknown>, captchaToken: string) {
  const res = await fetch(`${PROXY_BASE}/api${SUBMIT_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Captcha-Token': captchaToken,
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Submission failed');
  }
  return res.json();
}


function cleanFields(fields: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    if (typeof value === 'object' && !Array.isArray(value) && 'key' in (value as any)) {
      cleaned[key] = (value as any).key;
    } else if (Array.isArray(value)) {
      cleaned[key] = value.map(item =>
        typeof item === 'object' && item !== null && 'key' in item ? item.key : item
      );
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export default function PublicFormKursplan() {
  const [fields, setFields] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captchaRef = useRef<HTMLElement | null>(null);

  // Load the ALTCHA web component script once per page.
  useEffect(() => {
    if (document.querySelector(`script[src="${ALTCHA_SCRIPT_SRC}"]`)) return;
    const s = document.createElement('script');
    s.src = ALTCHA_SCRIPT_SRC;
    s.defer = true;
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    const qIdx = hash.indexOf('?');
    if (qIdx === -1) return;
    const params = new URLSearchParams(hash.slice(qIdx + 1));
    const prefill: Record<string, any> = {};
    params.forEach((value, key) => { prefill[key] = value; });
    if (Object.keys(prefill).length) setFields(prev => ({ ...prefill, ...prev }));
  }, []);

  function readCaptchaToken(): string | null {
    const el = captchaRef.current as any;
    if (!el) return null;
    return el.value || el.getAttribute('value') || null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = readCaptchaToken();
    if (!token) {
      setError('Bitte warte auf die Spam-Prüfung und versuche es erneut.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitPublicForm(cleanFields(fields), token);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Etwas ist schiefgelaufen. Bitte versuche es erneut.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold">Vielen Dank!</h2>
          <p className="text-muted-foreground">Deine Eingabe wurde erfolgreich übermittelt.</p>
          <Button variant="outline" className="mt-4" onClick={() => { setSubmitted(false); setFields({}); }}>
            Weitere Eingabe
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">Kursplan — Formular</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 bg-card rounded-xl border border-border p-6 shadow-md">
          <div className="space-y-2">
            <Label htmlFor="kursname">Kursname *</Label>
            <Select
              value={lookupKey(fields.kursname) ?? ''}
              onValueChange={v => setFields(f => ({ ...f, kursname: v === 'none' ? undefined : v as any }))}
            >
              <SelectTrigger id="kursname" className="max-sm:h-11"><SelectValue placeholder="" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="vinyasa_flow">Vinyasa Flow</SelectItem>
                <SelectItem value="yin_yoga">Yin Yoga</SelectItem>
                <SelectItem value="hatha_yoga">Hatha Yoga</SelectItem>
                <SelectItem value="power_yoga">Power Yoga</SelectItem>
                <SelectItem value="restorative_yoga">Restorative Yoga</SelectItem>
                <SelectItem value="meditation">Meditation</SelectItem>
                <SelectItem value="pranayama">Pranayama</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="trainer">Trainer/in *</Label>
            <div role="radiogroup" className="flex flex-wrap gap-1.5">
              <button
                type="button"
                role="radio"
                aria-checked={lookupKey(fields.trainer) === 'betreiberin'}
                onClick={() => setFields(f => ({ ...f, trainer: (lookupKey(f.trainer) === 'betreiberin' ? undefined : 'betreiberin') as any }))}
                className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  lookupKey(fields.trainer) === 'betreiberin'
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background text-foreground border-input hover:bg-accent'
                }`}
              >
                Ich (Studiobetreiberin)
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={lookupKey(fields.trainer) === 'trainer_1'}
                onClick={() => setFields(f => ({ ...f, trainer: (lookupKey(f.trainer) === 'trainer_1' ? undefined : 'trainer_1') as any }))}
                className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  lookupKey(fields.trainer) === 'trainer_1'
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background text-foreground border-input hover:bg-accent'
                }`}
              >
                Trainer/in 1
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={lookupKey(fields.trainer) === 'trainer_2'}
                onClick={() => setFields(f => ({ ...f, trainer: (lookupKey(f.trainer) === 'trainer_2' ? undefined : 'trainer_2') as any }))}
                className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  lookupKey(fields.trainer) === 'trainer_2'
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background text-foreground border-input hover:bg-accent'
                }`}
              >
                Trainer/in 2
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={lookupKey(fields.trainer) === 'trainer_3'}
                onClick={() => setFields(f => ({ ...f, trainer: (lookupKey(f.trainer) === 'trainer_3' ? undefined : 'trainer_3') as any }))}
                className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  lookupKey(fields.trainer) === 'trainer_3'
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background text-foreground border-input hover:bg-accent'
                }`}
              >
                Trainer/in 3
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wochentag">Wochentag *</Label>
            <Select
              value={lookupKey(fields.wochentag) ?? ''}
              onValueChange={v => setFields(f => ({ ...f, wochentag: v === 'none' ? undefined : v as any }))}
            >
              <SelectTrigger id="wochentag" className="max-sm:h-11"><SelectValue placeholder="" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="montag">Montag</SelectItem>
                <SelectItem value="dienstag">Dienstag</SelectItem>
                <SelectItem value="mittwoch">Mittwoch</SelectItem>
                <SelectItem value="donnerstag">Donnerstag</SelectItem>
                <SelectItem value="freitag">Freitag</SelectItem>
                <SelectItem value="samstag">Samstag</SelectItem>
                <SelectItem value="sonntag">Sonntag</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="uhrzeit">Uhrzeit *</Label>
            <Input
              id="uhrzeit"
              placeholder=""
              value={fields.uhrzeit ?? ''}
              onChange={e => setFields(f => ({ ...f, uhrzeit: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="raum">Raum *</Label>
            <Input
              id="raum"
              placeholder=""
              value={fields.raum ?? ''}
              onChange={e => setFields(f => ({ ...f, raum: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_plaetze">Maximale Plätze *</Label>
            <Input
              id="max_plaetze"
              type="number"
              step="any"
              min={0}
              placeholder=""
              value={fields.max_plaetze ?? ''}
              onChange={e => { const n = e.target.value ? Math.max(0, Number(e.target.value)) : undefined; setFields(f => ({ ...f, max_plaetze: n })); }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kurs_status">Kursstatus *</Label>
            <div role="radiogroup" className="flex flex-wrap gap-1.5">
              <button
                type="button"
                role="radio"
                aria-checked={lookupKey(fields.kurs_status) === 'findet_statt'}
                onClick={() => setFields(f => ({ ...f, kurs_status: (lookupKey(f.kurs_status) === 'findet_statt' ? undefined : 'findet_statt') as any }))}
                className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  lookupKey(fields.kurs_status) === 'findet_statt'
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background text-foreground border-input hover:bg-accent'
                }`}
              >
                Findet statt
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={lookupKey(fields.kurs_status) === 'abgesagt'}
                onClick={() => setFields(f => ({ ...f, kurs_status: (lookupKey(f.kurs_status) === 'abgesagt' ? undefined : 'abgesagt') as any }))}
                className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  lookupKey(fields.kurs_status) === 'abgesagt'
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background text-foreground border-input hover:bg-accent'
                }`}
              >
                Abgesagt
              </button>
            </div>
          </div>

          <altcha-widget
            ref={captchaRef as any}
            challengeurl={`${PROXY_BASE}/api/_challenge?path=${encodeURIComponent(SUBMIT_PATH)}`}
            auto="onsubmit"
            hidefooter
          />

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Wird gesendet...' : 'Absenden'}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-4">
          Powered by Klar
        </p>
      </div>
    </div>
  );
}
