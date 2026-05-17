/**
 * tiptapToPdf — Convert a Tiptap JSON document to @react-pdf/renderer nodes.
 *
 * Handles the subset of Tiptap nodes produced by RichTextEditor:
 *   paragraph, bulletList, orderedList, listItem, text (with bold/italic marks), hardBreak
 *
 * Usage:
 *   import { tiptapToPdf } from '../lib/tiptapToPdf'
 *   import { View } from '@react-pdf/renderer'
 *   <View>{tiptapToPdf(fields.content, { fontSize: 13, color: '#374151' })}</View>
 */

import React from 'react'
import { Text, View } from '@react-pdf/renderer'

const FONT = 'Poppins'

/** Render inline content (array of text/hardBreak nodes) within a Text element */
function renderInline(nodes = [], baseStyle = {}) {
  return nodes.map((node, i) => {
    if (node.type === 'hardBreak') return <Text key={i}>{'\n'}</Text>
    if (node.type !== 'text') return null

    const marks = node.marks || []
    const bold   = marks.some((m) => m.type === 'bold')
    const italic = marks.some((m) => m.type === 'italic')

    const style = {
      ...baseStyle,
      fontFamily: FONT,
      fontWeight: bold   ? 700 : (baseStyle.fontWeight || 400),
      fontStyle:  italic ? 'italic' : 'normal',
    }
    return <Text key={i} style={style}>{node.text || ''}</Text>
  })
}

/** Walk a Tiptap document node and return an array of react-pdf elements */
export function tiptapToPdf(doc, baseStyle = {}) {
  if (!doc || !doc.content) return null

  const textStyle = {
    fontSize: 13,
    color: '#374151',
    fontFamily: FONT,
    fontWeight: 400,
    lineHeight: 1.5,
    marginBottom: 6,
    ...baseStyle,
  }

  return doc.content.map((node, i) => {
    switch (node.type) {
      case 'paragraph': {
        if (!node.content || node.content.length === 0) {
          return <Text key={i} style={{ ...textStyle, marginBottom: 4 }}>{' '}</Text>
        }
        return (
          <Text key={i} style={textStyle}>
            {renderInline(node.content, textStyle)}
          </Text>
        )
      }

      case 'bulletList': {
        return (
          <View key={i} style={{ marginBottom: 6 }}>
            {(node.content || []).map((item, j) => {
              const inline = item.content?.[0]?.content || []
              return (
                <View key={j} style={{ flexDirection: 'row', marginBottom: 4 }}>
                  <Text style={{ ...textStyle, marginBottom: 0, width: 14 }}>•</Text>
                  <Text style={{ ...textStyle, marginBottom: 0, flex: 1 }}>
                    {renderInline(inline, textStyle)}
                  </Text>
                </View>
              )
            })}
          </View>
        )
      }

      case 'orderedList': {
        return (
          <View key={i} style={{ marginBottom: 6 }}>
            {(node.content || []).map((item, j) => {
              const inline = item.content?.[0]?.content || []
              return (
                <View key={j} style={{ flexDirection: 'row', marginBottom: 4 }}>
                  <Text style={{ ...textStyle, marginBottom: 0, width: 18 }}>{j + 1}.</Text>
                  <Text style={{ ...textStyle, marginBottom: 0, flex: 1 }}>
                    {renderInline(inline, textStyle)}
                  </Text>
                </View>
              )
            })}
          </View>
        )
      }

      default:
        return null
    }
  }).filter(Boolean)
}
