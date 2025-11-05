import { Group, Stack, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import Accounts from "./components/Accounts";
import DatabaseDrawer from "./components/DatabaseDrawer";

function AccountsPage() {
  const { t } = useTranslation();
  const [opened, { open, close }] = useDisclosure(false);
    
  return (
    <>
        <Group p="md">
          <Title>{t("accounts.title", "Accounts")}</Title>
        </Group>

        <Stack flex={1} style={{ overflow: "hidden" }} px="md" pb="md">
          <Accounts handleOpen={open} />
        </Stack>

      <DatabaseDrawer opened={opened} onClose={close} />
    </>
  );
}

export default AccountsPage;
