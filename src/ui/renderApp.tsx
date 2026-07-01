import { render } from "ink";
import { App } from "./App.js";
import { QuizScreen } from "./screens/QuizScreen.js";
import { SetupScreen } from "./screens/SetupScreen.js";
import { createSoundPlayer } from "./sound.js";
import type { QuizMode, QuizQuestion, SourceSummary, Store, UserConfig } from "../types.js";

export async function runInkHome({
  store,
  config,
  resolveSource
}: {
  store: Store;
  config: UserConfig;
  resolveSource: (args: { _: string[]; repo?: string }) => SourceSummary;
}) {
  const rendered = render(
    <App
      store={store}
      initialConfig={config}
      resolveSource={resolveSource}
      onExit={() => rendered.unmount()}
    />
  );
  await rendered.waitUntilExit();
}

export async function runInkQuiz(props: {
  store: Store;
  config: UserConfig;
  source: SourceSummary;
  questionsOverride?: QuizQuestion[] | null;
  mode?: QuizMode;
}) {
  const sound = createSoundPlayer(props.config);
  const rendered = render(
    <QuizScreen
      {...props}
      sound={sound}
      onDone={() => rendered.unmount()}
    />
  );
  await rendered.waitUntilExit();
}

export async function runInkSetup({ onComplete }: { onComplete: (config: UserConfig) => void }) {
  return new Promise<UserConfig>((resolve) => {
    const { unmount, waitUntilExit } = render(
      <SetupScreen
        onComplete={(config: UserConfig) => {
          onComplete(config);
          unmount();
          resolve(config);
        }}
      />
    );
    waitUntilExit().catch(() => {});
  });
}
