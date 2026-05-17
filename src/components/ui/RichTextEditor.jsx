import { useEditor, EditorContent } from '@tiptap/react'
import { useEffect, useState, useRef } from 'react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Italic, List, ListOrdered, Maximize2, Minimize2 } from 'lucide-react'

function ToolbarButton({ onClick, active, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-navy-900 text-white'
          : 'text-gray-500 hover:text-navy-900 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

// jsonMode=true: value/onChange use Tiptap JSON objects instead of HTML strings
export default function RichTextEditor({ value, onChange, placeholder, disabled, jsonMode = false, expandable = false }) {
  const [expanded, setExpanded] = useState(false)
  const rootRef = useRef(null)

  function toggleExpand() {
    const next = !expanded
    setExpanded(next)
    rootRef.current?.dispatchEvent(
      new CustomEvent('rte-expand', { bubbles: true, detail: { expanded: next } })
    )
  }
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        blockquote: false,
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Type your answer here…',
      }),
    ],
    content: value || '',
    editable: !disabled,
    onUpdate({ editor }) {
      if (jsonMode) {
        onChange(editor.isEmpty ? null : editor.getJSON())
      } else {
        const html = editor.isEmpty ? '' : editor.getHTML()
        onChange(html)
      }
    },
  })

  // Sync external value into editor (e.g. when pre-existing answers load async)
  useEffect(() => {
    if (!editor) return
    if (jsonMode) {
      // Compare by serialized JSON to avoid spurious resets
      const currentJson = editor.isEmpty ? null : editor.getJSON()
      const currentSer = JSON.stringify(currentJson)
      const valueSer   = JSON.stringify(value || null)
      if (currentSer !== valueSer) {
        editor.commands.setContent(value || '', false)
      }
    } else {
      const current = editor.isEmpty ? '' : editor.getHTML()
      if ((value || '') !== current) {
        editor.commands.setContent(value || '', false)
      }
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null

  return (
    <div ref={rootRef} className={`rounded-lg border ${disabled ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white focus-within:ring-2 focus-within:ring-primary-400 focus-within:border-transparent'} overflow-hidden`}>
      {/* Toolbar */}
      {!disabled && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50/60">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            title="Bold"
          >
            <Bold size={13} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            title="Italic"
          >
            <Italic size={13} />
          </ToolbarButton>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            title="Bullet list"
          >
            <List size={13} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            title="Numbered list"
          >
            <ListOrdered size={13} />
          </ToolbarButton>
          {expandable && (
            <>
              <div className="w-px h-4 bg-gray-200 mx-1 ml-auto" />
              <ToolbarButton onClick={toggleExpand} title={expanded ? 'Collapse' : 'Expand editor'}>
                {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </ToolbarButton>
            </>
          )}
        </div>
      )}
      {/* Editor area */}
      <EditorContent
        editor={editor}
        className={`prose prose-sm max-w-none px-3 py-2.5 min-h-[120px] text-navy-900 focus:outline-none
          [&_.ProseMirror]:outline-none
          [&_.ProseMirror_p]:my-1
          [&_.ProseMirror_ul]:my-1 [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ul]:list-disc
          [&_.ProseMirror_ol]:my-1 [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_ol]:list-decimal
          [&_.ProseMirror_li]:my-0.5
          [&_.ProseMirror_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]
          [&_.ProseMirror_.is-editor-empty:first-child::before]:text-gray-400
          [&_.ProseMirror_.is-editor-empty:first-child::before]:float-left
          [&_.ProseMirror_.is-editor-empty:first-child::before]:pointer-events-none
          [&_.ProseMirror_.is-editor-empty:first-child::before]:h-0
        `}
      />
    </div>
  )
}
