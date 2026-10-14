declare module 'mirador' {
  const Mirador: {
    viewer(config: Record<string, unknown>): unknown;
    actions: { updateViewport(windowId: string, payload: { x: number; y: number; zoom: number }): unknown };
  };
  export default Mirador;
}
