import { Group, Stack, Title } from "@mantine/core";
import Accounts from "./components/Accounts";
import Databases from "./components/Databases";

function AccountsPage() {
  return (
    <Stack h="100%">
      <Group align="baseline" pl="lg" py="sm">
        <Title>Accounts</Title>
      </Group>

      <Group grow flex={1} style={{ overflow: "hidden" }} px="md" pb="md" align="start">
        <Stack h="100%">
          <Accounts />
        </Stack>
        <Databases />
      </Group>
    </Stack>
  );
}

export default AccountsPage;
