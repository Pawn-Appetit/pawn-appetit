import { Group, Stack, Title } from "@mantine/core";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import Accounts from "./components/Accounts";
import Databases from "./components/Databases";

function AccountsPage() {
  const { layout } = useResponsiveLayout();
  const isMobile = layout.accounts.layoutType === "mobile";

  return (
    <Stack h="100%">
      <Group align="baseline" pl="lg" py="sm">
        <Title>Accounts</Title>
      </Group>

      {isMobile ? (
        <Stack flex={1} style={{ overflow: "hidden" }} px="md" pb="md">
          <Accounts />
          <Databases />
        </Stack>
      ) : (
        <Group grow flex={1} style={{ overflow: "hidden" }} px="md" pb="md" align="start">
          <Stack h="100%">
            <Accounts />
          </Stack>
          <Databases />
        </Group>
      )}
    </Stack>
  );
}

export default AccountsPage;
