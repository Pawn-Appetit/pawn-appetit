import { Center, Loader, Paper, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { commands, type Player } from "@/bindings";
import PersonalPlayerCard from "@/features/accounts/components/PersonalCard";
import { unwrap } from "@/utils/unwrap";

function PlayerCard({ player, file }: { player: Player; file: string }) {
  const { data: info, isLoading } = useQuery({
    queryKey: ["player-game-info", file, player.id],
    queryFn: async () => {
      const games = await commands.getPlayersGameInfo(file, player.id);
      return unwrap(games);
    },
    staleTime: Infinity,
  });

  return (
    <>
      {isLoading && (
        <Paper withBorder h="100%">
          <Center h="100%">
            <Stack align="center">
              <Text fw="bold">Processing player data...</Text>
              <Loader />
            </Stack>
          </Center>
        </Paper>
      )}
      {info && <PersonalPlayerCard name={player.name!} info={info} />}
    </>
  );
}

export default PlayerCard;
