import { Window } from "happy-dom";

// Set up DOM environment for React testing
const window = new Window();
global.window = window as any;
global.document = window.document as any;
global.HTMLElement = window.HTMLElement as any;
global.Element = window.Element as any;
global.Node = window.Node as any;

// Set up requestAnimationFrame and cancelAnimationFrame for React
global.requestAnimationFrame = (callback: FrameRequestCallback) => {
    return setTimeout(callback, 0);
};

global.cancelAnimationFrame = (id: number) => {
    clearTimeout(id);
};

// Set up additional globals that React might need
if (typeof global.navigator === "undefined") {
    global.navigator = {
        userAgent: "bun-test",
    } as any;
}
