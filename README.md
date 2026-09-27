# CyberTriage

## Project
CyberTriage

## Problem
Digital forensics and incident response investigation workflow.

## Objective
To help investigators organize evidence, detect suspicious activity, prioritize findings, and generate reports.

## Features
- Case Management
- Basic Evidence Import
- Synthetic ML Analysis
- Electron + React UI

## Architecture
Electron -> Python -> SQLite

## Technology
Electron, React, TypeScript, Chromium, Node.js, Python, scikit-learn, SQLite, electron-builder.

## Installation
`npm install`

## Development
`npm run electron:dev`

## Build
`npm run package`
`npm run package:dmg`

## Demo
Launch app, see basic UI.

## Supported Inputs
- Basic files

## Limitations
- Student prototype, incomplete features.
- Synthetic ML only.

## Security
- contextIsolation: true
- nodeIntegration: false

## Disclaimer
CyberTriage is a student prototype inspired by the published digital forensics and incident response problem statement. It is not an official product of the National Investigation Agency (NIA).
