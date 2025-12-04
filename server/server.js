import express from 'express'

const server = express()

server.use(express.static('./client'))

const PORT = 3000;
server.listen(PORT, '0.0.0.0')
console.log(`Server running at http://10.0.1.102:${PORT}/`);
