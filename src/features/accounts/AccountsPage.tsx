import { Button, Stack } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconDatabase, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import GenericHeader, { type SortState } from "@/components/GenericHeader";
import Accounts from "./components/Accounts";
import DatabaseDrawer from "./components/drawers/DatabaseDrawer";

function AccountsPage() {
  const { t } = useTranslation();
  const [opened, { open, close }] = useDisclosure(false);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortState>({ field: "name", direction: "asc" });
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [openModal, setOpenModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useState(() => {
    const timer = setTimeout(() => setIsLoading(false), 100);
    return () => clearTimeout(timer);
  });

  const sortOptions = [
    { value: "name", label: t("common.name", "Name") },
    { value: "elo", label: t("common.elo", "ELO") },
  ];

  return (
    <>
      <GenericHeader
        title={t("accounts.title")}
        searchPlaceholder="Search accounts"
        query={query}
        setQuery={setQuery}
        sortOptions={sortOptions}
        currentSort={sortBy}
        onSortChange={setSortBy}
        viewMode={viewMode}
        setViewMode={setViewMode}
        pageKey="accounts"
        filters={
          <Button size="xs" variant="light" leftSection={<IconDatabase size="1rem" />} onClick={open}>
            {t("accounts.viewDatabases")}
          </Button>
        }
        actions={
          <Button size="xs" leftSection={<IconPlus size="1rem" />} onClick={() => setOpenModal(true)}>
            Add Account
          </Button>
        }
      />

      <Stack flex={1} style={{ overflow: "hidden" }} px="md" pb="md">
        <Accounts open={openModal} setOpen={setOpenModal} view={viewMode} query={query} sortBy={sortBy} isLoading={isLoading} />
      </Stack>

      <DatabaseDrawer opened={opened} onClose={close} />
    </>
  );
}

export default AccountsPage;
