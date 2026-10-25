/** Slot catalog subset this plugin registers into. */
export interface SlotMap {
  'sidebar.panellist': { kind: 'list'; scope: 'root'; owner: { size: number; active: boolean } }
  main: { kind: 'keyed'; scope: 'root'; owner: Record<string, never> }
}

export type PanelIconProps = SlotMap['sidebar.panellist']['owner']

export type { }
