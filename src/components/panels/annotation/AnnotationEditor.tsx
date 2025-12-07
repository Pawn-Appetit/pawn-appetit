import { RichTextEditor } from "@mantine/tiptap";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useAtomValue } from "jotai";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { Markdown } from "tiptap-markdown";
import { useStore } from "zustand";
import { TreeStateContext } from "@/components/TreeStateContext";
import { spellCheckAtom } from "@/state/atoms";
import { getNodeAtPath } from "@/utils/treeReducer";

function AnnotationEditor() {
  const { t } = useTranslation();

  const store = useContext(TreeStateContext)!;
  const root = useStore(store, (s) => s.root);
  const position = useStore(store, (s) => s.position);
  const setComment = useStore(store, (s) => s.setComment);

  const currentNode = getNodeAtPath(root, position);
  const spellCheck = useAtomValue(spellCheckAtom);
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          // Disable link and underline from StarterKit since we're adding them separately with custom config
          link: false,
          underline: false,
        }),
        Underline,
        Link.configure({
          autolink: true,
          openOnClick: false,
        }),
        Markdown.configure({
          linkify: true,
        }),
        Placeholder.configure({ placeholder: t("features.board.annotate.writeHere") }),
      ],
      content: currentNode.comment,
      onUpdate: ({ editor }) => {
        // @ts-expect-error
        const comment = editor.storage.markdown.getMarkdown();
        setComment(comment);
      },
    },
    [position.join(",")],
  );

  return (
    <RichTextEditor editor={editor} spellCheck={spellCheck}>
      <RichTextEditor.Toolbar>
        <RichTextEditor.ControlsGroup>
          <RichTextEditor.Bold />
          <RichTextEditor.Italic />
          <RichTextEditor.Underline />
          <RichTextEditor.Strikethrough />
          <RichTextEditor.ClearFormatting />
        </RichTextEditor.ControlsGroup>

        <RichTextEditor.ControlsGroup>
          <RichTextEditor.H1 />
          <RichTextEditor.H2 />
          <RichTextEditor.H3 />
          <RichTextEditor.H4 />
        </RichTextEditor.ControlsGroup>

        <RichTextEditor.ControlsGroup>
          <RichTextEditor.Blockquote />
          <RichTextEditor.Hr />
          <RichTextEditor.BulletList />
          <RichTextEditor.OrderedList />
        </RichTextEditor.ControlsGroup>
        <RichTextEditor.ControlsGroup>
          <RichTextEditor.Link />
          <RichTextEditor.Unlink />
        </RichTextEditor.ControlsGroup>
      </RichTextEditor.Toolbar>

      <RichTextEditor.Content />
    </RichTextEditor>
  );
}

export default AnnotationEditor;
