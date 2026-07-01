import { exec } from "node:child_process";
import { platform } from "node:os";
import type { SoundPlayer, UserConfig } from "../types.js";

const os = platform();
type SupportedOs = "darwin" | "linux" | "win32";
const currentOs: SupportedOs = os === "darwin" || os === "linux" || os === "win32" ? os : "linux";
type SoundName = keyof typeof SOUND_MAP;

const SOUND_MAP = {
  navigate: {
    darwin: "/System/Library/Sounds/Pop.aiff",
    linux: "button-pressed",
    win32: null
  },
  select: {
    darwin: "/System/Library/Sounds/Tink.aiff",
    linux: "button-toggle-on",
    win32: null
  },
  correct: {
    darwin: "/System/Library/Sounds/Glass.aiff",
    linux: "complete",
    win32: null
  },
  incorrect: {
    darwin: "/System/Library/Sounds/Basso.aiff",
    linux: "dialog-error",
    win32: null
  },
  start: {
    darwin: "/System/Library/Sounds/Hero.aiff",
    linux: "service-login",
    win32: null
  },
  complete: {
    darwin: "/System/Library/Sounds/Ping.aiff",
    linux: "positive",
    win32: null
  },
  toggleOn: {
    darwin: "/System/Library/Sounds/Pop.aiff",
    linux: "button-toggle-on",
    win32: null
  },
  toggleOff: {
    darwin: "/System/Library/Sounds/Pop.aiff",
    linux: "button-toggle-off",
    win32: null
  }
};

function playDarwin(path?: string) {
  if (!path) return;
  exec(`afplay "${path}"`, { timeout: 2000 }, () => {});
}

function playLinux(name?: string) {
  if (!name) return;
  exec(`canberra-gtk-play -i ${name}`, { timeout: 2000 }, () => {});
}

function playWin32() {
  process.stdout.write("\x07");
}

const players: Record<SupportedOs, (arg?: string) => void> = {
  darwin: playDarwin,
  linux: playLinux,
  win32: playWin32
};

function playSound(name: SoundName) {
  const entry = SOUND_MAP[name];
  if (!entry) return;
  const arg = entry[currentOs];
  if (!arg && currentOs !== "win32") return;
  try {
    players[currentOs](arg ?? undefined);
  } catch {
    // sound is a non-critical enhancement; swallow errors
  }
}

/**
 * Create a sound player bound to the current config.
 * Returns an object with play methods for each sound event.
 * All methods are no-ops when config.soundEnabled is false.
 */
export function createSoundPlayer(config: UserConfig): SoundPlayer {
  const enabled = config?.soundEnabled === true;

  function fire(name: SoundName) {
    if (!enabled) return;
    playSound(name);
  }

  return {
    playNavigate: () => fire("navigate"),
    playSelect: () => fire("select"),
    playCorrect: () => fire("correct"),
    playIncorrect: () => fire("incorrect"),
    playStart: () => fire("start"),
    playComplete: () => fire("complete"),
    playToggleOn: () => fire("toggleOn"),
    playToggleOff: () => fire("toggleOff")
  };
}
