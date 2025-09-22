import { ActionIcon, Menu, Tooltip } from "@mantine/core";
import {
  IconArrowBack,
  IconCamera,
  IconChess,
  IconChessFilled,
  IconDeviceFloppy,
  IconDotsVertical,
  IconEdit,
  IconEditOff,
  IconEraser,
  IconPlus,
  IconReload,
  IconSwitchVertical,
  IconTarget,
  IconZoomCheck,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { keyMapAtom } from "@/state/keybindings";

interface BoardControlsMenuProps {
  viewPawnStructure?: boolean;
  setViewPawnStructure?: (value: boolean) => void;
  takeSnapshot?: () => void;
  canTakeBack?: boolean;
  deleteMove?: () => void;
  changeTabType?: () => void;
  currentTabType?: "analysis" | "play";
  eraseDrawablesOnClick?: boolean;
  clearShapes?: () => void;
  disableVariations?: boolean;
  editingMode?: boolean;
  toggleEditingMode?: () => void;
  saveFile?: () => void;
  reload?: () => void;
  addGame?: () => void;
  toggleOrientation?: () => void;
  currentTabSourceType?: string;
  count?: number;
  dirty?: boolean;
  autoSave?: boolean;
}

interface MenuItemConfig {
  id: string;
  condition: boolean;
  icon: React.ReactNode;
  activeIcon?: React.ReactNode;
  onClick: () => void;
  label: string;
  tooltipLabel?: string;
  variant?: "default" | "outline";
}

function BoardControlsMenu({
  viewPawnStructure,
  setViewPawnStructure,
  takeSnapshot,
  canTakeBack,
  deleteMove,
  changeTabType,
  currentTabType,
  eraseDrawablesOnClick,
  clearShapes,
  disableVariations,
  editingMode,
  toggleEditingMode,
  saveFile,
  reload,
  addGame,
  toggleOrientation,
  currentTabSourceType,
  count = 0,
  dirty = false,
  autoSave = false,
}: BoardControlsMenuProps) {
  const keyMap = useAtomValue(keyMapAtom);
  const { t } = useTranslation();

  // Define all menu items with their configurations
  const allMenuItems: MenuItemConfig[] = [
    {
      id: "pawnStructure",
      condition: !!setViewPawnStructure,
      icon: <IconChess size="1.3rem" />,
      activeIcon: <IconChessFilled size="1.3rem" />,
      onClick: () => setViewPawnStructure?.(!viewPawnStructure),
      label: t("features.board.actions.togglePawnStructureView"),
      tooltipLabel: t("features.board.actions.togglePawnStructureView"),
    },
    {
      id: "snapshot",
      condition: !!takeSnapshot,
      icon: <IconCamera size="1.3rem" />,
      onClick: () => takeSnapshot?.(),
      label: t("features.board.actions.takeSnapshot"),
      tooltipLabel: t("features.board.actions.takeSnapshot"),
    },
    {
      id: "takeBack",
      condition: !!canTakeBack && !!deleteMove,
      icon: <IconArrowBack size="1.3rem" />,
      onClick: () => deleteMove?.(),
      label: t("features.board.actions.takeBack"),
      tooltipLabel: t("features.board.actions.takeBack"),
    },
    {
      id: "changeTabType",
      condition: !!changeTabType,
      icon: currentTabType === "analysis" ? <IconTarget size="1.3rem" /> : <IconZoomCheck size="1.3rem" />,
      onClick: () => changeTabType?.(),
      label: t(
        currentTabType === "analysis" ? "features.board.actions.playFromHere" : "features.board.actions.analyzeGame",
      ),
      tooltipLabel: t(
        currentTabType === "analysis" ? "features.board.actions.playFromHere" : "features.board.actions.analyzeGame",
      ),
    },
    {
      id: "clearShapes",
      condition: !eraseDrawablesOnClick && !!clearShapes,
      icon: <IconEraser size="1.3rem" />,
      onClick: () => clearShapes?.(),
      label: t("features.board.actions.clearDrawings"),
      tooltipLabel: t("features.board.actions.clearDrawings"),
    },
    {
      id: "editingMode",
      condition: !disableVariations && !!toggleEditingMode,
      icon: <IconEdit size="1.3rem" />,
      activeIcon: <IconEditOff size="1.3rem" />,
      onClick: () => toggleEditingMode?.(),
      label: t("features.board.actions.editPosition"),
      tooltipLabel: t("features.board.actions.editPosition"),
    },
    {
      id: "saveFile",
      condition: !!saveFile,
      icon: <IconDeviceFloppy size="1.3rem" />,
      onClick: () => saveFile?.(),
      label: t("features.board.actions.savePGN", { key: keyMap.SAVE_FILE.keys }),
      tooltipLabel: t("features.board.actions.savePGN", { key: keyMap.SAVE_FILE.keys }),
      variant: (dirty && !autoSave ? "outline" : "default") as "default" | "outline",
    },
    {
      id: "reload",
      condition: !!reload,
      icon: <IconReload size="1.3rem" />,
      onClick: () => reload?.(),
      label: t("features.menu.reload"),
      tooltipLabel: t("features.menu.reload"),
    },
    {
      id: "addGame",
      condition: !!addGame && currentTabSourceType === "file",
      icon: <IconPlus size="1.3rem" />,
      onClick: () => addGame?.(),
      label: t("features.board.actions.addGame"),
      tooltipLabel: t("features.board.actions.addGame"),
    },
    {
      id: "toggleOrientation",
      condition: !!toggleOrientation,
      icon: <IconSwitchVertical size="1.3rem" />,
      onClick: () => toggleOrientation?.(),
      label: t("features.board.actions.flipBoard", { key: keyMap.SWAP_ORIENTATION.keys }),
      tooltipLabel: t("features.board.actions.flipBoard", { key: keyMap.SWAP_ORIENTATION.keys }),
    },
  ];

  // Filter items that should be shown
  const visibleItems = allMenuItems.filter((item) => item.condition);

  // Split items: last 'count' items become separate buttons, rest stay in menu
  const separateButtons = visibleItems.slice(-count);
  const menuItems = visibleItems.slice(0, -count);

  const renderIcon = (item: MenuItemConfig) => {
    if (item.id === "pawnStructure") {
      return viewPawnStructure ? item.activeIcon || item.icon : item.icon;
    }
    if (item.id === "editingMode") {
      return editingMode ? item.activeIcon || item.icon : item.icon;
    }
    return item.icon;
  };

  return (
    <ActionIcon.Group>
      {menuItems.length > 0 && (
        <Menu closeOnItemClick={false}>
          <Menu.Target>
            <ActionIcon variant="default" size="lg">
              <IconDotsVertical size="1rem" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {menuItems.map((item) => (
              <Menu.Item key={item.id} leftSection={renderIcon(item)} onClick={item.onClick}>
                {item.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      )}

      {separateButtons.map((item) => (
        <Tooltip key={item.id} label={item.tooltipLabel || item.label}>
          <ActionIcon onClick={item.onClick} size="lg" variant={item.variant || "default"}>
            {renderIcon(item)}
          </ActionIcon>
        </Tooltip>
      ))}
    </ActionIcon.Group>
  );
}

export default memo(BoardControlsMenu);
