import * as pdfjsLib from 'pdfjs-dist';

// Ensure the worker is set using local file via Vite URL import
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

/**
 * Formats a 24-hour time string (HH:mm:ss or HH:mm) to 12-hour AM/PM format.
 */
export const formatTime = (timeStr) => {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const seconds = parts.length > 2 ? `:${parts[2]}` : '';
  
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  
  return `${hours}:${minutes}${seconds} ${ampm}`;
};

/**
 * Formats duration in seconds to "Xh Ym Zs".
 */
export const formatDuration = (seconds) => {
  if (seconds === undefined || seconds === null) return '';
  const numSeconds = parseInt(seconds, 10);
  if (isNaN(numSeconds)) return seconds;

  const h = Math.floor(numSeconds / 3600);
  const m = Math.floor((numSeconds % 3600) / 60);
  const s = numSeconds % 60;

  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);

  return parts.join(' ');
};

export const parsePdf = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDocument = await loadingTask.promise;
  const numPages = pdfDocument.numPages;

  let allLines = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Group text items by Y coordinate (approximate lines)
    const items = textContent.items;
    
    // We sort items by Y descending, then X ascending
    items.sort((a, b) => {
      // Small tolerance for Y coordinate since they might not perfectly align
      if (Math.abs(a.transform[5] - b.transform[5]) > 2) {
        return b.transform[5] - a.transform[5];
      }
      return a.transform[4] - b.transform[4];
    });

    let currentY = null;
    let currentLine = [];
    
    items.forEach(item => {
      if (currentY === null || Math.abs(currentY - item.transform[5]) > 2) {
        if (currentLine.length > 0) {
          allLines.push(currentLine.join(' '));
        }
        currentLine = [item.str.trim()];
        currentY = item.transform[5];
      } else {
        currentLine.push(item.str.trim());
      }
    });
    if (currentLine.length > 0) {
      allLines.push(currentLine.join(' '));
    }
  }

  // Clean lines: replace multiple spaces with single space
  allLines = allLines.map(line => line.replace(/\s+/g, ' ').trim()).filter(line => line.length > 0);

  console.log("Extracted lines from PDF:", allLines);

  const parsedData = {
    recharge: [],
    voice: []
  };

  // Regex for Voice Statement: 
  // S.No., Date, Time, Number, Duration(sec), Amount(Rs)
  // e.g., "1 01-04-2026 13:28:34 7099369548 8 0.00"
  const voiceRegex = /^(\d+)\s+(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2}:\d{2})\s+(\d+)\s+(\d+)\s+([\d.]+)$/;
  
  // Regex for Recharge Statement:
  // S.No., Date, Time, Amount(Rs), Channel
  // e.g., "1 04-04-2026 11:19 349.0 N/A"
  const rechargeRegex = /^(\d+)\s+(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2})\s+([\d.]+)\s+(.*)$/;

  allLines.forEach(line => {
    const voiceMatch = line.match(voiceRegex);
    if (voiceMatch) {
      parsedData.voice.push({
        sNo: voiceMatch[1],
        date: voiceMatch[2],
        time: voiceMatch[3],
        number: voiceMatch[4],
        durationSec: voiceMatch[5],
        amountRs: voiceMatch[6]
      });
      return;
    }

    const rechargeMatch = line.match(rechargeRegex);
    if (rechargeMatch) {
      parsedData.recharge.push({
        sNo: rechargeMatch[1],
        date: rechargeMatch[2],
        time: rechargeMatch[3],
        amountRs: rechargeMatch[4],
        channel: rechargeMatch[5]
      });
      return;
    }
  });

  return parsedData;
};
