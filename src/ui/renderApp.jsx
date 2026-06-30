import { render } from "ink";
import React from "react";
import { App } from "./App.jsx";
import { QuizScreen } from "./screens/QuizScreen.jsx";
import { SetupScreen } from "./screens/SetupScreen.jsx";
import { createSoundPlayer } from "./sound.js";

export async function runInkHome({ store, config, resolveSource }) {
  const { unmount, waitUntilExit } = render(
    <App
      store={store}
      initialConfig={config}
      resolveSource={resolveSource}
      onExit={unmount}
    />
  );
  await waitUntilExit();
}

export async function runInkQuiz(props) {
  const sound = createSoundPlayer(props.config);
  const { unmount, waitUntilExit } = render(
    <QuizScreen
      {...props}
      sound={sound}
      onDone={unmount}
    />
  );
  await waitUntilExit();
}

export async function runInkSetup({ onComplete }) {
  return new Promise((resolve) => {
    const { unmount, waitUntilExit } = render(
      <SetupScreen
        onComplete={(config) => {
          onComplete(config);
          unmount();
          resolve(config);
        }}
      />
    );
    waitUntilExit().catch(() => {});
  });
}
