import { exec } from "node:child_process";
import { platform } from "node:os";

const os = platform();

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

function playDarwin(path) {
  exec(`afplay "${path}"`, { timeout: 2000 }, () => {});
}

function playLinux(name) {
  exec(`canberra-gtk-play -i ${name}`, { timeout: 2000 }, () => {});
}

function playWin32() {
  process.stdout.write("\x07");
}

const players = { darwin: playDarwin, linux: playLinux, win32: playWin32 };

function playSound(name) {
  const entry = SOUND_MAP[name];
  if (!entry) return;
  const arg = entry[os];
  if (!arg && os !== "win32") return;
  try {
    players[os](arg);
  } catch {
    // sound is a non-critical enhancement; swallow errors
  }
}

/**
 * Create a sound player bound to the current config.
 * Returns an object with play methods for each sound event.
 * All methods are no-ops when config.soundEnabled is false.
 */
export function createSoundPlayer(config) {
  const enabled = config?.soundEnabled === true;

  function fire(name) {
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
