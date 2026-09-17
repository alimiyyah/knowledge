const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const anthropic = new Anthropic();

const TRANSCRIPTS_DIR = path.join(process.cwd(), 'transcripts');
const NOTES_DIR = path.join(process.cwd(), 'notes');
const TEMPLATE_PATH = path.join(process.cwd(), 'template.md');

const SUPPORTED_EXTENSIONS = ['.md', '.txt', '.pdf', '.docx'];

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.md' || ext === '.txt') {
    return fs.readFileSync(filePath, 'utf-8');
  }

  if (ext === '.pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

async function main() {
  const changedFolders = (process.env.CHANGED_FOLDERS || '')
    .split(',')
    .map(f => f.trim())
    .filter(Boolean);

  if (changedFolders.length === 0) {
    console.log('No changed date folders detected. Exiting.');
    return;
  }

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  for (const dateFolder of changedFolders) {
    const folderPath = path.join(TRANSCRIPTS_DIR, dateFolder);
    if (!fs.existsSync(folderPath)) continue;

    const files = fs.readdirSync(folderPath)
      .filter(f => SUPPORTED_EXTENSIONS.includes(path.extname(f).toLowerCase()));

    if (files.length === 0) {
      console.log(`No supported transcript files in ${dateFolder}. Skipping.`);
      continue;
    }

    console.log(`Processing ${dateFolder}: ${files.join(', ')}`);

    const transcriptChunks = [];
    for (const f of files) {
      const studentName = path.basename(f, path.extname(f));
      try {
        const content = await extractText(path.join(folderPath, f));
        transcriptChunks.push(`--- Transcript from ${studentName} ---\n${content}`);
      } catch (err) {
        console.error(`Failed to extract text from ${f}: ${err.message}`);
      }
    }

    if (transcriptChunks.length === 0) {
      console.log(`No readable transcripts in ${dateFolder}. Skipping.`);
      continue;
    }

    const transcripts = transcriptChunks.join('\n\n');

    const prompt = `You are consolidating multiple students' transcripts from the same class session into a single, seamless set of notes.

Merge the transcripts below into ONE coherent narrative — do not organize by student. Combine overlapping content, fill gaps where one transcript covers something another missed, and resolve minor discrepancies by using the most complete/accurate
