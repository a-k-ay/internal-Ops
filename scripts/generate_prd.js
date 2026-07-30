import fs from 'fs';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

const prdFile = 'C:/Users/Admin/.gemini/antigravity/brain/23f743a4-9fe6-4585-97f4-a349615e7337/PRD.md';
const outputFile = './Project_Requirements_Document.docx';

async function generate() {
    try {
        const content = fs.readFileSync(prdFile, 'utf8');
        const lines = content.split('\n');

        const children = [];

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed && !line.startsWith(' ')) return;

            if (line.startsWith('# ')) {
                children.push(new Paragraph({
                    text: trimmed.replace('# ', ''),
                    heading: HeadingLevel.HEADING_1,
                    spacing: { after: 200, before: 400 },
                }));
            } else if (line.startsWith('## ')) {
                children.push(new Paragraph({
                    text: trimmed.replace('## ', ''),
                    heading: HeadingLevel.HEADING_2,
                    spacing: { after: 150, before: 300 },
                }));
            } else if (line.startsWith('### ')) {
                children.push(new Paragraph({
                    text: trimmed.replace('### ', ''),
                    heading: HeadingLevel.HEADING_3,
                    spacing: { after: 120, before: 200 },
                }));
            } else if (line.startsWith('- ') || line.startsWith('* ')) {
                children.push(new Paragraph({
                    text: trimmed.substring(2),
                    bullet: { level: 0 },
                    spacing: { after: 100 },
                }));
            } else if (line.startsWith('    - ') || line.startsWith('  - ')) {
                children.push(new Paragraph({
                    text: trimmed.substring(trimmed.indexOf('-') + 2),
                    bullet: { level: 1 },
                    spacing: { after: 100 },
                }));
            } else if (line.startsWith('**') && line.endsWith('**')) {
                children.push(new Paragraph({
                    children: [new TextRun({ text: trimmed.replace(/\*\*/g, ''), bold: true })],
                    spacing: { after: 120 },
                }));
            } else {
                // Handle bold/italic in line (simple)
                const text = trimmed.replace(/\*\*/g, '');
                children.push(new Paragraph({
                    children: [new TextRun(text)],
                    spacing: { after: 120 },
                }));
            }
        });

        const doc = new Document({
            sections: [{
                properties: {},
                children: children,
            }],
        });

        const buffer = await Packer.toBuffer(doc);
        fs.writeFileSync(outputFile, buffer);
        console.log(`Document created: ${outputFile}`);
    } catch (error) {
        console.error('Error generating docx:', error);
    }
}

generate();
