import { useState, useRef, useEffect, useMemo } from "react";
import {
  Upload,
  FileType,
  CheckCircle2,
  AlertCircle,
  Edit2,
  BarChart3,
  List,
} from "lucide-react";
import { parsePdf, formatTime, formatDuration, getEndTime } from "./utils/pdfParser";



const EditableCell = ({ value, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  const handleBlur = () => {
    setIsEditing(false);
    if (currentValue !== value) {
      onSave(currentValue);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.target.blur();
    } else if (e.key === "Escape") {
      setCurrentValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        autoFocus
        type="text"
        className="w-full px-2 py-1 text-sm border-2 border-airtel-red rounded outline-none shadow-sm font-medium"
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <div
      className="cursor-pointer hover:bg-slate-100 px-2 py-1 -mx-2 rounded transition-colors text-slate-700 min-h-[28px] flex items-center group"
      onClick={() => setIsEditing(true)}
      title="Click to edit name"
    >
      <span className="font-semibold">
        {value || (
          <span className="text-slate-400 italic font-normal">Unknown</span>
        )}
      </span>
      <Edit2
        size={12}
        className="ml-2 text-slate-400 opacity-0 group-hover:opacity-100"
      />
    </div>
  );
};

function App() {
  const [file, setFile] = useState(null);
  const [data, setData] = useState(null);
  const [contacts, setContacts] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentView, setCurrentView] = useState("statements");
  const fileInputRef = useRef(null);

  const reportData = useMemo(() => {
    if (!data?.voice) return [];
    const aggregation = {};
    data.voice.forEach((row) => {
      if (!aggregation[row.number]) {
        aggregation[row.number] = {
          number: row.number,
          count: 0,
          totalDurationSec: 0,
        };
      }
      aggregation[row.number].count += 1;
      aggregation[row.number].totalDurationSec += parseInt(row.durationSec || 0, 10);
    });

    return Object.values(aggregation).sort(
      (a, b) => b.totalDurationSec - a.totalDurationSec
    );
  }, [data]);

  // Auto-populate names for new numbers
  useEffect(() => {
    if (!data || !data.voice) return;

    const uniqueNumbers = [...new Set(data.voice.map((row) => row.number))];

    // Find numbers we don't have in contacts yet
    const newNumbers = uniqueNumbers.filter((num) => !(num in contacts));

    if (newNumbers.length > 0) {
      const fetchNames = async () => {
        try {
          const response = await fetch('/api/contacts/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ numbers: newNumbers })
          });
          const result = await response.json();
          
          if (result.contacts) {
            setContacts((prev) => ({ ...prev, ...result.contacts }));
          }
        } catch (error) {
          console.error("Failed to fetch names:", error);
        }
      };

      fetchNames();
    }
  }, [data, contacts]);

  const handleContactSave = async (number, newName) => {
    // Optimistic UI update
    setContacts((prev) => ({
      ...prev,
      [number]: newName,
    }));
    
    // Save to database
    try {
      await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, name: newName })
      });
    } catch (error) {
      console.error("Failed to save contact name:", error);
    }
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.type !== "application/pdf") {
      setError("Please upload a valid PDF file.");
      return;
    }

    setFile(selectedFile);
    setError(null);
    setIsLoading(true);

    try {
      const parsedData = await parsePdf(selectedFile);
      setData(parsedData);
      if (parsedData.recharge.length === 0 && parsedData.voice.length === 0) {
        setError(
          "No itemized statement data found in the PDF. Please make sure it is a valid Airtel bill.",
        );
      }
    } catch (err) {
      console.error(err);
      // If the PDF is password protected, ask for the password and retry
      const msg = err?.message || '';
      if (/password|encrypted/i.test(msg)) {
        const pw = window.prompt('This PDF appears to be password protected. Please enter the password:');
        if (pw) {
          try {
            setIsLoading(true);
            const parsedData2 = await parsePdf(selectedFile, pw);
            setData(parsedData2);
            if (parsedData2.recharge.length === 0 && parsedData2.voice.length === 0) {
              setError(
                "No itemized statement data found in the PDF. Please make sure it is a valid Airtel bill.",
              );
            } else {
              setError(null);
            }
          } catch (err2) {
            console.error(err2);
            setError("Failed to parse the PDF. " + err2.message);
          } finally {
            setIsLoading(false);
          }
        } else {
          setError('Failed to parse the PDF. No password provided.');
        }
      } else {
        setError("Failed to parse the PDF. " + err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      fileInputRef.current.files = e.dataTransfer.files;
      handleFileChange({ target: { files: e.dataTransfer.files } });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <header className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3 bg-airtel-red text-white rounded-2xl shadow-lg shadow-red-500/30 mb-4">
            <FileType size={40} />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">
            Airtel Bill Parser
          </h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            Upload your Airtel itemized statement PDF to automatically format
            times to 12h (AM/PM) and durations to readable hours, minutes, and
            seconds.
          </p>
        </header>

        {/* Uploader */}
        {!data && (
          <div
            className={`border-2 border-dashed rounded-3xl p-12 text-center transition-all duration-200 ease-in-out cursor-pointer ${
              isLoading
                ? "bg-slate-100 border-slate-300"
                : "bg-white border-airtel-red/40 hover:border-airtel-red hover:bg-red-50/50 hover:shadow-xl hover:shadow-red-500/5"
            }`}
            onClick={() => !isLoading && fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf"
              onChange={handleFileChange}
            />

            <div className="flex flex-col items-center justify-center space-y-4">
              {isLoading ? (
                <div className="w-16 h-16 border-4 border-slate-200 border-t-airtel-red rounded-full animate-spin"></div>
              ) : (
                <div className="w-20 h-20 rounded-full bg-red-50 text-airtel-red flex items-center justify-center">
                  <Upload size={32} />
                </div>
              )}

              <div className="space-y-1">
                <p className="text-xl font-semibold">
                  {isLoading
                    ? "Parsing PDF Document..."
                    : "Click to upload or drag and drop"}
                </p>
                <p className="text-slate-500 text-sm">
                  {isLoading
                    ? "Extracting itemized records and formatting data"
                    : "PDF (max. 10MB)"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-700">
            <AlertCircle className="shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold">Error</h3>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Results */}
        {data && !isLoading && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-green-600 bg-green-50 px-4 py-2 rounded-full border border-green-200">
                <CheckCircle2 size={20} />
                <span className="font-medium text-sm">
                  Successfully parsed {file?.name}
                </span>
              </div>
              
              <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button
                    onClick={() => setCurrentView("statements")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      currentView === "statements"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <List size={16} />
                    Statements
                  </button>
                  <button
                    onClick={() => setCurrentView("report")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      currentView === "report"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <BarChart3 size={16} />
                    Report
                  </button>
                </div>
                <button
                  onClick={() => {
                    setData(null);
                    setFile(null);
                    setCurrentView("statements");
                  }}
                  className="text-sm font-medium text-airtel-red hover:text-red-700 hover:underline transition-colors whitespace-nowrap"
                >
                  Upload new
                </button>
              </div>
            </div>

            {/* Statements View */}
            {currentView === "statements" && (
              <>
                {/* Recharge Statement */}
                {data.recharge.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-slate-800">
                    Recharge Statement
                  </h2>
                  <span className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                    {data.recharge.length} records
                  </span>
                </div>
                <div className="overflow-x-auto rounded-xl shadow-sm border border-slate-200">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>S.No.</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Amount(Rs)</th>
                        <th>Channel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recharge.map((row, i) => (
                        <tr key={i}>
                          <td>{row.sNo}</td>
                          <td>{row.date}</td>
                          <td className="font-medium text-airtel-red">
                            {formatTime(row.time)}
                          </td>
                          <td>{row.amountRs}</td>
                          <td>{row.channel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Voice Statement */}
            {data.voice.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-slate-800">
                    Voice Statement
                  </h2>
                  <span className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                    {data.voice.length} records
                  </span>
                </div>
                <div className="overflow-x-auto rounded-xl shadow-sm border border-slate-200">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>S.No.</th>
                        <th>Date</th>
                        <th>Started</th>
                        <th>Ended</th>
                        <th>Name</th>
                        <th>Number</th>
                        <th>Duration</th>
                        {/* <th>Amount(Rs)</th> */}
                      </tr>
                    </thead>
                    <tbody>
                      {data.voice.map((row, i) => (
                        <tr key={i}>
                          <td>{row.sNo}</td>
                          <td>{row.date}</td>
                          <td className="font-medium text-airtel-red">
                            {formatTime(row.time)}
                          </td>
                          <td className="font-medium text-amber-600 bg-amber-50/30">
                            {getEndTime(row.time, row.durationSec)}
                          </td>
                          <td className="w-48">
                            <EditableCell
                              value={contacts[row.number] || ""}
                              onSave={(newName) => handleContactSave(row.number, newName)}
                            />
                          </td>
                          <td className="font-mono text-slate-600">
                            {row.number}
                          </td>
                          <td className="font-medium text-blue-600 bg-blue-50/50">
                            {formatDuration(row.durationSec)}
                          </td>
                          {/* <td>{row.amountRs}</td> */}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
              </>
            )}

            {/* Report View */}
            {currentView === "report" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-slate-800">
                    Usage Report
                  </h2>
                  <span className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                    {reportData.length} unique numbers
                  </span>
                </div>
                <div className="overflow-x-auto rounded-xl shadow-sm border border-slate-200">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Name</th>
                        <th>Number</th>
                        <th>Total Duration</th>
                        <th>Calls Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map((row, i) => (
                        <tr key={i}>
                          <td className="text-slate-500 font-medium">#{i + 1}</td>
                          <td className="w-48">
                            <EditableCell
                              value={contacts[row.number] || ""}
                              onSave={(newName) => handleContactSave(row.number, newName)}
                            />
                          </td>
                          <td className="font-mono text-slate-600">
                            {row.number}
                          </td>
                          <td className="font-medium text-blue-600 bg-blue-50/50">
                            {formatDuration(row.totalDurationSec)}
                          </td>
                          <td className="text-center font-semibold bg-slate-50">
                            {row.count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
