import { useEffect, useMemo, useRef, useState } from 'react';
import { COMBINATIONS, COMBO_ALIASES, NUMBER_WORDS } from './constants';
import AddNewPlayerForm from './components/NewPlayerForm';

/**
 * Minimal type declarations for the Web Speech API to avoid TS errors like
 * "Cannot find name 'SpeechRecognitionEvent'" and to avoid `any`.
 */
interface ISpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

interface ISpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: ISpeechRecognitionResultItem;
}

interface ISpeechRecognitionResultList {
  length: number;
  [index: number]: ISpeechRecognitionResult;
}

interface ISpeechRecognitionEvent extends Event {
  results: ISpeechRecognitionResultList;
}

interface ISpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((this: ISpeechRecognition, ev: ISpeechRecognitionEvent) => unknown)
    | null;
  onerror: ((this: ISpeechRecognition, ev: Event) => unknown) | null;
  onaudioend: ((this: ISpeechRecognition, ev: Event) => unknown) | null;
}

interface ISpeechRecognitionConstructor {
  new (): ISpeechRecognition;
}

declare global {
  interface Window {
    webkitSpeechRecognition?: ISpeechRecognitionConstructor;
    SpeechRecognition?: ISpeechRecognitionConstructor;
  }
}

// ------------------- Domain model -------------------

export type ComboKey =
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | 'каре'
  | 'фулл-хаус'
  | 'короткий стрит'
  | 'длинный стрит'
  | 'покер'
  | 'любая';

interface Player {
  name: string;
  scores: Record<ComboKey, number | null>;
}

// ------------------- Helpers -------------------

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[()"'«»:,.;!?]/g, ' ')
    .replace(/[–—_-]/g, ' ') // тире и дефисы -> пробел
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (s: string): string[] => normalize(s).split(' ');

/**
 * Проверка: совпадают ли токены B с начала массива A (prefix match).
 * Возвращает длину совпадения (кол-во токенов), либо 0 если не совпало.
 */
const matchFromStart = (a: string[], b: string[]): number => {
  if (b.length === 0 || a.length < b.length) return 0;
  for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return 0;
  return b.length;
};

/** Найти игрока по префиксу команды (ожидается, что имя идёт в начале). */
const pickPlayerAtStart = (
  players: Player[],
  cmdTokens: string[]
): { player: Player; used: number } | null => {
  let best: { player: Player; used: number } | null = null;
  for (const p of players) {
    const nameTokens = tokenize(p.name);
    const used = matchFromStart(cmdTokens, nameTokens);
    if (used > 0 && (!best || used > best.used)) best = { player: p, used };
  }
  return best;
};

/** Найти комбинацию по префиксу оставшихся токенов. Выбираем наиболее длинный вариант. */
const pickComboAtStart = (
  cmdTokens: string[]
): { combo: ComboKey; used: number } | null => {
  let best: { combo: ComboKey; used: number } | null = null;
  for (const key of COMBINATIONS) {
    for (const alias of COMBO_ALIASES[key]) {
      const used = matchFromStart(cmdTokens, tokenize(alias));
      if (used > 0 && (!best || used > best.used)) best = { combo: key, used };
    }
  }
  return best;
};

/** Извлечь первое целое число или словесное число из токенов. */
const pickPointsAtStart = (
  cmdTokens: string[]
): { points: number; used: number } | null => {
  if (cmdTokens.length === 0) return null;
  const token = cmdTokens[0];
  // Попробуем сначала как число
  const n = Number.parseInt(token, 10);
  if (!Number.isNaN(n)) return { points: n, used: 1 };
  // Попробуем как словесное число
  if (NUMBER_WORDS[token] !== undefined)
    return { points: NUMBER_WORDS[token], used: 1 };
  return null;
};

// ------------------- UI -------------------

export default function App() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [listening, setListening] = useState(false);
  const [lastCommand, setLastCommand] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [past, setPast] = useState<Player[][]>([]);
  const [future, setFuture] = useState<Player[][]>([]);

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const playersRef = useRef<Player[]>(players);

  const SpeechRecognitionCtor: ISpeechRecognitionConstructor | undefined =
    useMemo(() => {
      return window.SpeechRecognition ?? window.webkitSpeechRecognition;
    }, []);

  const saveToHistory = (current: Player[]) => {
    setPast((prev) => [
      ...prev,
      current.map((p) => ({ ...p, scores: { ...p.scores } }))
    ]);
    setFuture([]);
  };

  // Обновляем ref при изменении игроков
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const processCommand = (raw: string) => {
    const tokens = tokenize(raw);

    const pickedPlayer = pickPlayerAtStart(playersRef.current, tokens);
    if (!pickedPlayer) return;
    const restAfterPlayer = tokens.slice(pickedPlayer.used);

    const pickedCombo = pickComboAtStart(restAfterPlayer);
    if (!pickedCombo) return;
    const restAfterCombo = restAfterPlayer.slice(pickedCombo.used);

    const pickedPoints = pickPointsAtStart(restAfterCombo);
    if (!pickedPoints) return;

    // Сохраняем историю
    saveToHistory(playersRef.current);

    setPlayers((prev) =>
      prev.map((p) =>
        p.name === pickedPlayer.player.name
          ? {
              ...p,
              scores: { ...p.scores, [pickedCombo.combo]: pickedPoints.points }
            }
          : p
      )
    );
  };

  useEffect(() => {
    if (!SpeechRecognitionCtor) return;
    const rec = new SpeechRecognitionCtor();
    rec.lang = 'ru-RU';
    rec.interimResults = false;
    rec.continuous = true;

    rec.onresult = (_ev: ISpeechRecognitionEvent) => {
      const results = _ev.results;
      const last = results[results.length - 1];
      const transcript = last[0].transcript.trim();
      setLastCommand(transcript);
      processCommand(transcript);
    };

    rec.onerror = () =>
      setError('Ошибка распознавания речи. Попробуйте снова.');
    rec.onaudioend = () => setListening(false);

    recognitionRef.current = rec;

    return () => {
      rec.stop();
      recognitionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SpeechRecognitionCtor]);

  const startListening = () => {
    if (!recognitionRef.current) {
      setError(
        'Ваш браузер не поддерживает Web Speech API (SpeechRecognition).'
      );
      return;
    }
    setError(null);
    recognitionRef.current.start();
    setListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const addPlayer = (name: string) => {
    if (!name) return;
    saveToHistory(playersRef.current);
    console.log(playersRef.current);
    console.log(name);
    if (
      playersRef.current.some(
        (p) => p.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      setError('Игрок с таким именем уже существует.');
      return;
    }
    const emptyScores = Object.fromEntries(
      COMBINATIONS.map((c) => [c, null])
    ) as Record<ComboKey, number | null>;
    setPlayers((prev) => [...prev, { name, scores: emptyScores }]);
  };

  const undo = () => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((prev) => prev.slice(0, -1));
    setFuture((f) => [
      ...f,
      players.map((p) => ({ ...p, scores: { ...p.scores } }))
    ]);
    setPlayers(previous);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[future.length - 1];
    setFuture((f) => f.slice(0, -1));
    setPast((p) => [
      ...p,
      players.map((pl) => ({ ...pl, scores: { ...pl.scores } }))
    ]);
    setPlayers(next);
  };

  const resetScores = () => {
    setPlayers((prev) =>
      prev.map((p) => ({
        ...p,
        scores: Object.fromEntries(
          COMBINATIONS.map((c) => [c, null])
        ) as Record<ComboKey, number | null>
      }))
    );
  };

  const startNewGame = () => {
    setPlayers([]);
    setPast([]);
    setFuture([]);
  };

  useEffect(() => {
    console.log(`Ошибка: ${error}`);
  }, [error]);

  return (
    <div className="min-h-screen p-6 flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-4xl font-bold w-full text-center mb-4 text-blue-400">
          Покер на костях — Голосовая таблица
        </h1>
      </header>

      <section>
        <div className="w-full flex justify-center gap-10 overflow-auto">
          <table className="border border-gray-300 rounded-xl overflow-hidden min-w-1/3">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-300 p-2">Комбинация</th>
                {players.map((p) => (
                  <th key={p.name} className="border border-gray-300 p-2">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMBINATIONS.map((c) => (
                <tr key={c} className="odd:bg-white even:bg-gray-50">
                  <td className="border border-gray-300 p-2">{c}</td>
                  {players.map((p) => (
                    <td
                      key={p.name}
                      className="border border-gray-300 p-2 text-center"
                    >
                      {p.scores[c] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="border border-gray-300 p-2 font-bold">Итого</td>
                {players.map((p) => (
                  <td
                    key={p.name}
                    className="border border-gray-300 p-2 text-center font-bold"
                  >
                    {Object.values(p.scores).reduce(
                      (sum: number, val) => sum + (val ?? 0),
                      0
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <div className="flex flex-col justify-between gap-6 py-2 w-[400px]">
            <div className="flex flex-col gap-6">
              <AddNewPlayerForm addPlayer={addPlayer} />
              <section className="flex gap-4 items-end flex-wrap">
                <button
                  onClick={resetScores}
                  className="px-4 py-2 rounded-2xl shadow border hover:shadow-md"
                >
                  ♻️ Сбросить очки
                </button>
                <button
                  onClick={startNewGame}
                  className="px-4 py-2 rounded-2xl shadow border hover:shadow-md"
                >
                  🔄️ Начать новую игру
                </button>
              </section>
            </div>

            <div className="flex flex-col gap-4">
              <div className="bg-white rounded-2xl shadow h-fit p-4 text-sm max-w-full">
                <p>Последняя распознанная команда:</p>
                <p className="opacity-50 break-words whitespace-pre-wrap w-full overflow-hidden">
                  {lastCommand || 'Команда не была распознана'}
                </p>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-700">
                <p className="font-medium mb-1">Формат голосовой команды:</p>
                <code className="block bg-gray-100 rounded-md px-2 py-1 text-gray-800">
                  Имя_игрока Комбинация Очки
                </code>
                <p className="mt-2 leading-relaxed text-wrap">
                  Примеры: «Андрей каре 25», Дима единицы 5».
                </p>
              </div>
            </div>

            <div className="flex justify-between gap-2">
              {!listening ? (
                <button
                  onClick={startListening}
                  className="px-4 py-2 rounded-2xl shadow border hover:shadow-md"
                >
                  🎤 Старт
                </button>
              ) : (
                <button
                  onClick={stopListening}
                  className="px-4 py-2 rounded-2xl shadow border hover:shadow-md"
                >
                  ⏹ Стоп
                </button>
              )}
              <div className="">
                <button
                  onClick={undo}
                  className="bg-red-500 text-white px-4 py-2 rounded mr-2 disabled:opacity-50"
                  disabled={past.length === 0}
                >
                  ↶ Отменить
                </button>

                <button
                  onClick={redo}
                  className="bg-blue-500 text-white px-4 py-2 rounded mr-2 disabled:opacity-50"
                  disabled={future.length === 0}
                >
                  Вернуть ↷
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
