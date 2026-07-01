import { Box, Text } from "ink";
import { symbols, theme } from "../theme.js";

type SelectItem = { id?: string; label: string };

export function SelectList({
  items,
  selectedIndex,
  showIndex = false
}: {
  items: SelectItem[];
  selectedIndex: number;
  showIndex?: boolean;
}) {
  return (
    <Box flexDirection="column">
      {items.map((item, index) => {
        const selected = index === selectedIndex;
        const prefix = showIndex ? `${index + 1}. ` : selected ? `${symbols.pointer} ` : `${symbols.pointerIdle} `;

        if (selected) {
          return (
            <Box key={item.id ?? item.label}>
              <Text
                backgroundColor={theme.selectionBg}
                color={theme.text}
                bold
              >
                {prefix}
                {item.label}
              </Text>
            </Box>
          );
        }

        return (
          <Box key={item.id ?? item.label}>
            <Text color={theme.text}>
              {prefix}
              {item.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
