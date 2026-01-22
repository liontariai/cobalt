import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Cobalt',
  description: 'Use GraphQL in a tRPC style. tRPC\'s speed, GQL\'s flexibility.',
  base: '/docs/',
  cleanUrls: true,
  lang: 'en-US',

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#3b82f6' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Cobalt - GraphQL in a tRPC style' }],
    ['meta', { property: 'og:description', content: 'tRPC\'s speed, GQL\'s flexibility. No headaches. No compromise.' }],
    ['script', { defer: 'true', 'data-domain': 'cobalt27.dev', src: 'https://pl.liontari.ai/js/script.js' }],
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'API', link: '/api/cli' },
      { text: 'Examples', link: '/examples/todo-app' },
      {
        text: 'Links',
        items: [
          { text: 'GitHub', link: 'https://github.com/liontariai/cobalt' },
          { text: 'npm', link: 'https://www.npmjs.com/package/@cobalt27/dev' },
        ]
      }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is Cobalt?', link: '/guide/introduction' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Project Structure', link: '/guide/project-structure' },
          ]
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Operations Overview', link: '/guide/operations' },
            { text: 'Queries', link: '/guide/queries' },
            { text: 'Mutations', link: '/guide/mutations' },
            { text: 'Subscriptions', link: '/guide/subscriptions' },
            { text: 'Magic $$-helper-functions', link: '/guide/magic-helpers' },
          ]
        },
        {
          text: 'Context & Auth',
          items: [
            { text: 'Context Factory', link: '/guide/context' },
            { text: 'Cobalt Auth', link: '/guide/auth' },
            { text: 'Frontend Integration', link: '/guide/frontend-integration' },
          ]
        },
        {
          text: 'SDK Usage',
          items: [
            { text: 'Generated SDK', link: '/guide/sdk' },
            { text: 'The $lazy Pattern', link: '/guide/lazy-pattern' },
            { text: 'Field Selection', link: '/guide/field-selection' },
          ]
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Types & Schemas', link: '/guide/types' },
            { text: 'Enums', link: '/guide/enums' },
            { text: 'Union Types', link: '/guide/unions' },
            { text: 'Nested Objects', link: '/guide/nested-objects' },
            { text: 'Lists & Arrays', link: '/guide/lists' },
          ]
        },
        {
          text: 'Deployment',
          items: [
            { text: 'Building for Production', link: '/guide/production' },
            { text: 'Docker', link: '/guide/docker' },
          ]
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'CLI Commands', link: '/api/cli' },
            { text: 'Context Helpers', link: '/api/context-helpers' },
            { text: 'SDK Methods', link: '/api/sdk-methods' },
          ]
        }
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Todo App', link: '/examples/todo-app' },
            { text: 'With Authentication', link: '/examples/with-auth' },
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/liontariai/cobalt' }
    ],

    footer: {
      message: 'Released under the SSPL License.',
      copyright: 'Copyright © 2024-present cobalt27.dev'
    },

    search: {
      provider: 'local'
    },

    editLink: {
      pattern: 'https://github.com/liontariai/cobalt/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    }
  }
})
