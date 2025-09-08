import { useState, useEffect } from 'react';

const toastStyles = {
  warning: {
    bg: 'bg-yellow-800/50',
    border: 'border-yellow-600',
    text: 'text-yellow-200',
    title: 'Warning!',
  },
  error: {
    bg: 'bg-red-800/50',
    border: 'border-red-600',
    text: 'text-red-200',
    title: 'Error!',
  },
  success: {
    bg: 'bg-green-800/50',
    border: 'border-green-600',
    text: 'text-green-200',
    title: 'Success!',
  },
};

function Toast({ message, type = 'warning', onClear }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        // Allow time for fade-out animation before clearing the message
        setTimeout(() => onClear(), 500);
      }, 3000); // Message visible for 3 seconds

      return () => clearTimeout(timer);
    }
  }, [message, onClear]);

  const styles = toastStyles[type] || toastStyles.warning;

  return (
    <div
      className={`z-50 fixed top-5 right-5 backdrop-blur-xl px-6 py-3 rounded-lg shadow-lg transition-opacity duration-500 ${styles.bg} ${styles.border} ${styles.text} ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      <span className="font-bold">{styles.title}</span>
      <p>{message}</p>
    </div>
  );
}
export default Toast;