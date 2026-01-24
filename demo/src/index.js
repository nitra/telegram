import { sendMessage, sendDocument } from '@nitra/telegram'

// Тест sendMessage
await sendMessage('Hello, world!', { parse_mode: 'HTML' })

// Тест sendDocument - CSV file
const testData = [
  { name: 'John Doe', email: 'john@example.com', department: 'IT', position: 'Developer' },
  { name: 'Jane Smith', email: 'jane@example.com', department: 'HR', position: 'Manager' },
  { name: 'Peter Johnson', email: 'peter@example.com', department: 'Sales', position: 'Sales Manager' },
  { name: 'Anna Brown', email: 'anna@example.com', department: 'Marketing', position: 'Specialist' },
  { name: 'Dmitry Shvets', email: 'dmitry@example.com', department: 'IT', position: 'Team Lead' }
]

const csvHeader = 'Name,Email,Department,Position'
const csvRows = testData.map(row => `${row.name},${row.email},${row.department},${row.position}`)
const csvContent = [csvHeader, ...csvRows].join('\r\n')

sendDocument(Buffer.from(csvContent), {
  caption: `Test sending CSV: ${testData.length} users`,
  contentType: 'text/csv',
  filename: 'users_report.csv'
})
