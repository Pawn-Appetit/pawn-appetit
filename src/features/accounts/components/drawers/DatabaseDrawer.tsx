import { Drawer } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import Databases from "../Databases";

interface DatabaseDrawerProps {
  opened: boolean;
  onClose: () => void;
}

function DatabaseDrawer({ opened, onClose }: DatabaseDrawerProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={isMobile ? "100%" : "xl"}
      title="Player Databases"
      styles={{
        body: {
          height: "calc(100% - 60px)",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <Databases />
    </Drawer>
  );
}

export default DatabaseDrawer;
