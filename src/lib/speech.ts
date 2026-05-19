import { useCallback, useRef, useState } from 'react';

// Minimal shape of the Web Speech API (not in the TS DOM lib).
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionErrorLike {
  error: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type MicError = 'denied' | 'no-mic' | 'unsupported' | null;

export interface MicHelp {
  title: string;
  steps: string[];
}

/** Permission guidance tailored to the user's device/browser. */
export function getMicHelp(reason: MicError): MicHelp {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Mac/.test(ua) && 'ontouchend' in document);
  const isAndroid = /Android/.test(ua);
  const isFirefox = /Firefox/.test(ua);

  if (reason === 'unsupported' || isFirefox) {
    return {
      title: "Voice logging isn't supported here",
      steps: [
        "This browser can't transcribe speech.",
        'Open Tenor in Chrome or Safari, or use the emotion picker instead.',
      ],
    };
  }
  if (reason === 'no-mic') {
    return {
      title: 'No microphone found',
      steps: [
        "We couldn't reach a microphone on this device.",
        'Check that one is connected, then try again.',
      ],
    };
  }
  if (isIOS) {
    return {
      title: 'Microphone is off for Tenor',
      steps: [
        'Open the Settings app.',
        'Go to Safari → Microphone (or Settings → Tenor).',
        'Allow microphone access, then return and try again.',
      ],
    };
  }
  if (isAndroid) {
    return {
      title: 'Microphone is off for Tenor',
      steps: [
        'Tap the lock icon next to the address bar.',
        'Open Permissions → Microphone and set it to Allow.',
        'Reload the page, then try again.',
      ],
    };
  }
  return {
    title: 'Microphone is blocked',
    steps: [
      'Click the camera/mic icon in the address bar.',
      'Set the microphone to Allow for this site.',
      'Reload the page, then try again.',
    ],
  };
}

export interface SpeechState {
  supported: boolean;
  listening: boolean;
  transcript: string;
  interim: string;
  error: MicError;
  start: () => void;
  stop: () => void;
  reset: () => void;
  setTranscript: (t: string) => void;
}

export function useSpeechRecognition(): SpeechState {
  const ctorRef = useRef<SpeechRecognitionCtor | null>(getCtor());
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const stoppingRef = useRef(false);

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<MicError>(null);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    recRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = ctorRef.current;
    if (!Ctor) {
      setError('unsupported');
      return;
    }
    setError(null);
    stoppingRef.current = false;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (e) => {
      let finalAdd = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalAdd += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (finalAdd) setTranscript((t) => (t ? t + ' ' : '') + finalAdd.trim());
      setInterim(interimText);
    };

    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('denied');
      } else if (e.error === 'audio-capture') {
        setError('no-mic');
      }
      setListening(false);
    };

    rec.onend = () => {
      // Auto-restart for true continuous capture unless the user stopped.
      if (!stoppingRef.current && !error) {
        try {
          rec.start();
          return;
        } catch {
          /* ignore double-start */
        }
      }
      setListening(false);
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError('denied');
    }
  }, [error]);

  const reset = useCallback(() => {
    stoppingRef.current = true;
    recRef.current?.abort();
    recRef.current = null;
    setTranscript('');
    setInterim('');
    setError(null);
    setListening(false);
  }, []);

  return {
    supported: ctorRef.current !== null,
    listening,
    transcript,
    interim,
    error,
    start,
    stop,
    reset,
    setTranscript,
  };
}
