import { Box, Button, Card, Group, Stack, Tabs, Text, Title } from "@mantine/core";
import { IconDownload, IconPlus, IconSearch } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import GenericHeader from "@/components/GenericHeader";
import { loadMainAccount } from "@/utils/mainAccount";
import { CreateTournamentForm } from "./components/CreateTournamentForm";
import { TournamentList } from "./components/TournamentList";

export default function TournamentsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string>("import");
  const [accountName, setAccountName] = useState<string | null>(null);
  const [lichessToken, setLichessToken] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load main account (name and token)
  useEffect(() => {
    loadMainAccount().then((account) => {
      if (account) {
        setAccountName(account.name);
        setLichessToken(account.lichessToken || null);
      }
    });
  }, []);

  // Listen for main account changes
  useEffect(() => {
    const handleAccountChange = (event: CustomEvent) => {
      const account = event.detail;
      setAccountName(account.name);
      setLichessToken(account.lichessToken || null);
      // Refresh templates when account changes
      setRefreshKey((prev) => prev + 1);
    };

    window.addEventListener("mainAccountChanged", handleAccountChange as EventListener);
    return () => {
      window.removeEventListener("mainAccountChanged", handleAccountChange as EventListener);
    };
  }, []);

  // Listen for template saved events
  useEffect(() => {
    const handleTemplateSaved = () => {
      setRefreshKey((prev) => prev + 1);
    };

    window.addEventListener("tournament-template-saved", handleTemplateSaved);
    return () => {
      window.removeEventListener("tournament-template-saved", handleTemplateSaved);
    };
  }, []);

  return (
    <>
      <GenericHeader
        title={t("features.sidebar.tournaments", "Tournaments")}
        pageKey="tournaments"
        showViewToggle={false}
      />

      <Box px="md" pb="md">
        <Tabs value={activeTab} onChange={(v) => setActiveTab(v || "import")}>
          <Tabs.List>
            <Tabs.Tab value="import" leftSection={<IconDownload size={16} />}>
              {t("features.tournaments.import", "Import")}
            </Tabs.Tab>
            <Tabs.Tab value="search" leftSection={<IconSearch size={16} />}>
              {t("features.tournaments.search", "Search")}
            </Tabs.Tab>
            <Tabs.Tab value="create" leftSection={<IconPlus size={16} />}>
              {t("features.tournaments.create", "Create")}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="import" pt="md">
            <Card withBorder p="md">
              <Stack gap="md">
                <Text size="lg" fw={600}>
                  {t("features.tournaments.importTab.title", "Import Tournament from Lichess")}
                </Text>
                <Text size="sm" c="dimmed">
                  {t(
                    "features.tournaments.importTab.description",
                    "Import tournament games from Lichess using a tournament ID or URL",
                  )}
                </Text>
                {!lichessToken && (
                  <Text size="sm" c="red">
                    {t(
                      "features.tournaments.importTab.noToken",
                      "Lichess token not found. Please add your Lichess token in the main account settings.",
                    )}
                  </Text>
                )}
                <Button
                  leftSection={<IconDownload size={16} />}
                  disabled={!lichessToken}
                  onClick={() => {
                    // TODO: Implement tournament import
                    console.log("Import tournament");
                  }}
                >
                  {t("features.tournaments.importTab.button", "Import Tournament")}
                </Button>
              </Stack>
            </Card>
          </Tabs.Panel>

          <Tabs.Panel value="search" pt="md">
            <TournamentList lichessToken={lichessToken} accountName={accountName} key={refreshKey} />
          </Tabs.Panel>

          <Tabs.Panel value="create" pt="md">
            <CreateTournamentForm
              lichessToken={lichessToken}
              accountName={accountName}
              onTemplateSaved={() => {
                // Trigger refresh of tournament list
                setRefreshKey((prev) => prev + 1);
                // Optionally switch to search tab to see the new template
                // setActiveTab("search");
              }}
            />
          </Tabs.Panel>
        </Tabs>
      </Box>
    </>
  );
}
