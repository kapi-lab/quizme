import React from "react";
import { Box, Text } from "ink";

export function SelectList({ items, selectedIndex, showIndex = false }) {
  return (
    <Box flexDirection="column">
      {items.map((item, index) => {
        const selected = index === selectedIndex;
        const prefix = showIndex ? `${index + 1}. ` : selected ? "❯ " : "  ";
        return (
          <Box key={item.id ?? item.label}>
            <Text color={selected ? "cyan" : undefined} bold={selected}>
              {prefix}
              {item.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
