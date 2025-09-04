import { CheckIcon, ColorSwatch, Input, SimpleGrid, useMantineColorScheme, useMantineTheme } from "@mantine/core";
import { useColorScheme } from "@mantine/hooks";
import { useAtom, useAtomValue } from "jotai";
import { currentThemeAtom } from "@/features/themes/state/themeAtoms";
import { primaryColorAtom } from "@/state/atoms";

export default function ColorControl({ disabled }: { disabled?: boolean }) {
  const [, setPrimaryColor] = useAtom(primaryColorAtom);
  const theme = useMantineTheme();
  const currentTheme = useAtomValue(currentThemeAtom);
  const { colorScheme } = useMantineColorScheme();
  const osColorScheme = useColorScheme();

  // Use primary color from current theme (which includes overrides)
  const effectivePrimaryColor = currentTheme.primaryColor;

  const colors = Object.keys(theme.colors).map((color) => (
    <ColorSwatch
      color={
        colorScheme === "dark" || (osColorScheme === "dark" && colorScheme === "auto")
          ? theme.colors[color][7]
          : theme.colors[color][5]
      }
      component="button"
      disabled={disabled}
      key={color}
      onClick={() => setPrimaryColor(color)}
      radius="sm"
      style={{
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color:
          colorScheme === "dark" || (osColorScheme === "dark" && colorScheme === "auto")
            ? theme.colors[color][2]
            : theme.white,
        flex: "1 0 calc(15% - 4px)",
        ...(disabled ? { cursor: "not-allowed", opacity: 0.5 } : {}),
      }}
    >
      {effectivePrimaryColor === color && <CheckIcon width={12} height={12} />}
    </ColorSwatch>
  ));

  return (
    <Input.Wrapper labelElement="div">
      <SimpleGrid cols={7} spacing="xs" verticalSpacing="xs">
        {colors}
      </SimpleGrid>
    </Input.Wrapper>
  );
}
