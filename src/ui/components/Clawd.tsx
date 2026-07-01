import { Box, Text } from "ink";
import { theme } from "../theme.js";

export type ClawdPose = "default" | "arms-up" | "look-left" | "look-right";

type Segments = {
  r1L: string;
  r1E: string;
  r1R: string;
  r2L: string;
  r2R: string;
};

const POSES: Record<ClawdPose, Segments> = {
  default: {
    r1L: " ▐",
    r1E: "▛███▜",
    r1R: "▌",
    r2L: "▝▜",
    r2R: "▛▘"
  },
  "look-left": {
    r1L: " ▐",
    r1E: "▟███▟",
    r1R: "▌",
    r2L: "▝▜",
    r2R: "▛▘"
  },
  "look-right": {
    r1L: " ▐",
    r1E: "▙███▙",
    r1R: "▌",
    r2L: "▝▜",
    r2R: "▛▘"
  },
  "arms-up": {
    r1L: "▗▟",
    r1E: "▛███▜",
    r1R: "▙▖",
    r2L: " ▜",
    r2R: "▛ "
  }
};

export function Clawd({ pose = "default" }: { pose?: ClawdPose }) {
  const p = POSES[pose];
  return (
    <Box flexDirection="column">
      <Text>
        <Text color={theme.clawdBody}>{p.r1L}</Text>
        <Text color={theme.clawdBody} backgroundColor={theme.clawdBackground}>
          {p.r1E}
        </Text>
        <Text color={theme.clawdBody}>{p.r1R}</Text>
      </Text>
      <Text>
        <Text color={theme.clawdBody}>{p.r2L}</Text>
        <Text color={theme.clawdBody} backgroundColor={theme.clawdBackground}>
          █████
        </Text>
        <Text color={theme.clawdBody}>{p.r2R}</Text>
      </Text>
      <Text color={theme.clawdBody}>{"  "}▘▘ ▝▝{"  "}</Text>
    </Box>
  );
}
