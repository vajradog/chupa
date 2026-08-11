/// <reference types="vite/client" />

// So `import.meta.env.DEV` is typed. The dressing room uses it to leave the
// `save numbers` button out of a production build, where the middleware it
// posts to does not exist.
