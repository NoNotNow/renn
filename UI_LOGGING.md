# UI Interaction Logging

This document describes the UI interaction logging system that has been implemented in the Renn application.

## Overview

A comprehensive logging system has been added to track all user interactions (clicks, changes, selections, uploads, and deletions) across the entire application. All logs are output to the browser console and stored in memory for debugging and analytics purposes.

## Logger Location

The centralized logger is located at: `src/utils/uiLogger.ts`

## Features

### 1. Centralized Logging Utility

The `uiLogger` singleton provides methods for logging different types of interactions:

- `click()` - Log click interactions
- `change()` - Log input/change interactions  
- `select()` - Log dropdown/select interactions
- `upload()` - Log file upload interactions
- `delete()` - Log deletion interactions

### 2. Console Output Format

All logs are formatted as:
```
[UI {TYPE}] {Component} > {Action} | {Details JSON}
```

Example:
```
[UI CLICK] Builder > Select entity | {"entityId":"ball","entityName":"ball"}
[UI CHANGE] PropertyPanel > Change entity name | {"entityId":"ball","oldName":"ball","newName":"My Ball"}
[UI SELECT] Builder > Add entity | {"shapeType":"box","entityId":"entity_1234567890"}
```

### 3. Memory Storage

- Logs are stored in memory (last 1000 entries)
- Access via `window.uiLogger` in browser console
- Export logs: `window.uiLogger.export()`
- View logs: `window.uiLogger.getLogs()`
- Clear logs: `window.uiLogger.clear()`

## Logged Interactions by Component

### Builder.tsx
- **Clicks**: New, Save, Save As, Download, Upload, Delete, Play, Refresh list, Select entity, Switch tabs
- **Selects**: Open project, Add entity, Change camera target, Change camera mode
- **Uploads**: Import project files (JSON/ZIP)
- **Deletes**: Delete project, Delete entity

### PropertyPanel.tsx
- **Changes**: 
  - Entity name
  - Shape type
  - Shape dimensions (width, height, depth, radius)
  - Position, rotation, scale
  - Body type, mass, restitution, friction
  - Material properties (color, roughness, metalness)
- **Deletes**: Delete entity button

### AssetPanel.tsx
- **Clicks**: Upload asset button
- **Uploads**: Upload asset files (images, models)
- **Deletes**: Remove asset

### ScriptPanel.tsx
- **Clicks**: Add script, Remove script
- **Selects**: Select script from dropdown
- **Changes**: Edit script content (Monaco editor)

## Usage Examples

### Accessing Logs in Browser Console

```javascript
// View all logs
window.uiLogger.getLogs()

// Export logs as JSON
console.log(window.uiLogger.export())

// Clear all logs
window.uiLogger.clear()

// Get count of logs
window.uiLogger.getLogs().length
```

### Filtering Logs

```javascript
// Get all click interactions
window.uiLogger.getLogs().filter(log => log.type === 'click')

// Get all interactions for a specific component
window.uiLogger.getLogs().filter(log => log.component === 'PropertyPanel')

// Get all entity selection clicks
window.uiLogger.getLogs().filter(log => 
  log.action.includes('Select entity')
)
```

## Log Data Structure

Each log entry contains:

```typescript
{
  type: 'click' | 'change' | 'input' | 'select' | 'upload' | 'delete',
  component: string,        // Component name (e.g., 'Builder', 'PropertyPanel')
  action: string,           // Description of the action
  details?: {               // Optional additional context
    // Varies by interaction type
  },
  timestamp: string         // ISO 8601 timestamp
}
```

## Benefits

1. **Debugging**: Easily trace user actions that led to a bug
2. **Analytics**: Understand how users interact with the application
3. **Testing**: Verify that all interactions are being captured
4. **User Research**: Analyze usage patterns and improve UX
5. **Audit Trail**: Track all changes made to projects

## Performance

- Minimal overhead: Logging is synchronous but very fast
- Memory efficient: Only last 1000 logs are kept
- No network calls: All logging is local to the browser
- Console output can be filtered/disabled in production if needed

## Future Enhancements

Potential improvements:
- Add log levels (debug, info, warn, error)
- Integrate with analytics services (Google Analytics, Mixpanel, etc.)
- Add session tracking and user identification
- Export logs to file for support tickets
- Add performance timing data
- Filter logs by time range or component
