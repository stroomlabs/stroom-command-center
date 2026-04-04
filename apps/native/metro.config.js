const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find workspace root (two levels up from apps/native)
const workspaceRoot = path.resolve(__dirname, '../..');

const config = getDefaultConfig(__dirname);

// Watch all workspace packages
config.watchFolders = [workspaceRoot];

// Resolve node_modules from both the app and workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Ensure packages/* source files are transpiled
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
