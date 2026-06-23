import React from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

interface DateRangePickerProps {
  startDate: Date | null;
  endDate: Date | null;
  onChange: (start: Date | null, end: Date | null) => void;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
}) => {
  const setPreset = (preset: 'today' | 'week' | 'month') => {
    const end = new Date();
    const start = new Date();
    if (preset === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (preset === 'week') {
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (preset === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }
    onChange(start, end);
  };

  return (
    <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-card shadow-custom">
      <div className="flex gap-2">
        <button
          onClick={() => setPreset('today')}
          type="button"
          className="px-3 py-1.5 text-xs font-medium border border-lightGrey rounded-button bg-lightGrey hover:bg-darkNavy hover:text-white transition-all"
        >
          Today
        </button>
        <button
          onClick={() => setPreset('week')}
          type="button"
          className="px-3 py-1.5 text-xs font-medium border border-lightGrey rounded-button bg-lightGrey hover:bg-darkNavy hover:text-white transition-all"
        >
          This Week
        </button>
        <button
          onClick={() => setPreset('month')}
          type="button"
          className="px-3 py-1.5 text-xs font-medium border border-lightGrey rounded-button bg-lightGrey hover:bg-darkNavy hover:text-white transition-all"
        >
          This Month
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-darkNavy font-medium">Custom:</span>
        <DatePicker
          selected={startDate}
          onChange={(date) => onChange(date, endDate)}
          selectsStart
          startDate={startDate}
          endDate={endDate}
          maxDate={new Date()}
          className="w-28 px-3 py-1.5 text-xs border border-lightGrey rounded-input focus:outline-none focus:border-primaryGreen"
          placeholderText="Start Date"
        />
        <span className="text-xs text-darkNavy font-medium">to</span>
        <DatePicker
          selected={endDate}
          onChange={(date) => onChange(startDate, date)}
          selectsEnd
          startDate={startDate}
          endDate={endDate}
          minDate={startDate || undefined}
          maxDate={new Date()}
          className="w-28 px-3 py-1.5 text-xs border border-lightGrey rounded-input focus:outline-none focus:border-primaryGreen"
          placeholderText="End Date"
        />
      </div>
    </div>
  );
};

export default DateRangePicker;
