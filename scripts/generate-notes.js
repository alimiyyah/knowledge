const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const TRANSCRIPTS_DIR = path.join(process.cwd(), 'transcripts');
const NOTES_DIR = path.join(process.cwd(), 'notes');
const TEMPLATE_PATH = path.join(process.cwd(), 'template.md');

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
      .filter(f => f.endsWith('.md') && f !== '.gitkeep');

    if (files.length === 0) continue;

    console.log(`Processing ${dateFolder}: ${files.join(', ')}`);

    const transcripts = files.map(f => {
      const content = fs.readFileSync(path.join(folderPath, f), 'utf-8');
      const studentName = path.basename(f, '.md');
      return `--- Transcript from ${studentName} ---\n${content}`;
    }).join('\n\n');

    const prompt = `You are consolidating multiple students' transcripts from the same class session into a single, seamless set of notes.

Merge the transcripts below into ONE coherent narrative — do not organize by student. Combine overlapping content, fill gaps where one transcript covers something another missed, and resolve minor discrepancies by using the most complete/accurate version. Write it as if one person attended and took comprehensive notes.

Follow this exact template structure:

${template}

Here are the transcripts for ${dateFolder}:

${transcripts}

Output only the completed markdown notes, nothing else.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });

    const noteContent = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true });

    const outputPath = path.join(NOTES_DIR, `${dateFolder}.md`);
    fs.writeFileSync(outputPath, noteContent, 'utf-8');
    console.log(`Written: ${outputPath}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
