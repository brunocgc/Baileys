import makeWASocket, { DisconnectReason, WACallEvent } from '../src'
import { Boom } from '@hapi/boom'
import { useMultiFileAuthState } from '../src/Utils/use-multi-file-auth-state'
import * as fs from 'fs'
import express from 'express'
import { Server as SocketIOServer } from 'socket.io'
import http from 'http'
import path from 'path'

// Configurações
const PORT = 3000

async function startWhatsAppCallHandler() {
  // Preparar a autenticação do WhatsApp
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')

  // Criar servidor HTTP e Socket.IO para WebRTC
  const app = express()
  const server = http.createServer(app)
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  })

  // Servir arquivos estáticos
  app.use(express.static(path.join(__dirname, 'public')))

  // Conectar ao WhatsApp
  const sock = makeWASocket({
    printQRInTerminal: true,
    auth: state
  })

  // Salvar credenciais quando atualizadas
  sock.ev.on('creds.update', saveCreds)

  // Armazenar chamadas ativas
  const activeCalls = new Map<string, WACallEvent>()

  // Lidar com eventos de conexão do WhatsApp
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('Conexão com WhatsApp fechada devido a ', lastDisconnect?.error, ', reconectando:', shouldReconnect)

      if (shouldReconnect) {
        startWhatsAppCallHandler()
      }
    } else if (connection === 'open') {
      console.log('Conexão com WhatsApp estabelecida!')
    }
  })

  // Lidar com eventos de chamada do WhatsApp
  sock.ev.on('call', async ([call]) => {
    console.log('Evento de chamada recebido:', call)

    // Quando receber uma oferta de chamada
    if (call.status === 'offer') {
      console.log(`Recebendo chamada de ${call.from}`)
      console.log(`É vídeo: ${call.isVideo ? 'Sim' : 'Não'}`)

      // Armazenar informações da chamada
      activeCalls.set(call.id, call)

      // Emitir evento para clientes WebRTC
      io.emit('incoming-call', {
        callId: call.id,
        from: call.from,
        isVideo: call.isVideo
      })

      // Exemplo: Auto-aceitar chamadas (opcional)
      // await sock.rejectCall(call.id, call.from)
    }
    // Quando uma chamada for finalizada
    else if (call.status === 'terminate' || call.status === 'reject' || call.status === 'timeout') {
      console.log(`Chamada ${call.id} finalizada com status: ${call.status}`)
      activeCalls.delete(call.id)
      io.emit('call-ended', { callId: call.id })
    }
  })

  // Socket.IO para WebRTC
  io.on('connection', (socket) => {
    console.log('Cliente WebRTC conectado:', socket.id)

    // Enviar lista de chamadas ativas ao cliente
    socket.emit('active-calls', Array.from(activeCalls.values()))

    // Cliente responde à chamada
    socket.on('answer-call', async ({ callId, answer }) => {
      const call = activeCalls.get(callId)
      if (call) {
        console.log(`Cliente ${socket.id} respondeu à chamada ${callId}`)
        // Aqui é onde o WebRTC começa a estabelecer a conexão
        // Transmitir o SDP resposta para outros clientes
        socket.broadcast.emit('call-answered', { callId, answer, clientId: socket.id })
      }
    })

    // Cliente rejeita a chamada
    socket.on('reject-call', async ({ callId }) => {
      const call = activeCalls.get(callId)
      if (call) {
        console.log(`Cliente ${socket.id} rejeitou a chamada ${callId}`)
        try {
          await sock.rejectCall(call.id, call.from)
          activeCalls.delete(callId)
          io.emit('call-ended', { callId })
        } catch (error) {
          console.error('Erro ao rejeitar chamada:', error)
        }
      }
    })

    // Cliente finaliza a chamada
    socket.on('end-call', async ({ callId }) => {
      const call = activeCalls.get(callId)
      if (call) {
        console.log(`Cliente ${socket.id} finalizou a chamada ${callId}`)
        try {
          await sock.terminateCall(call.id, call.from)
          activeCalls.delete(callId)
          io.emit('call-ended', { callId })
        } catch (error) {
          console.error('Erro ao finalizar chamada:', error)
        }
      }
    })

    // Retransmitir candidatos ICE entre clientes
    socket.on('ice-candidate', ({ callId, candidate }) => {
      socket.broadcast.emit('ice-candidate', { callId, candidate, clientId: socket.id })
    })

    // Quando o cliente desconectar
    socket.on('disconnect', () => {
      console.log('Cliente WebRTC desconectado:', socket.id)
    })
  })

  // Iniciar o servidor HTTP
  server.listen(PORT, () => {
    console.log(`Servidor WebRTC rodando na porta ${PORT}`)
  })

  // Criar arquivos estáticos para cliente WebRTC se não existirem
  createWebRTCClientFiles()
}

// Função para criar arquivos de cliente WebRTC
function createWebRTCClientFiles() {
  const publicDir = path.join(__dirname, 'public')
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir)
  }

  // Criar HTML
  const htmlContent = `
<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp Call Handler</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
    .container { max-width: 800px; margin: 0 auto; }
    .call-container { display: none; background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    .videos { display: flex; gap: 10px; margin: 20px 0; }
    video { width: 100%; max-width: 400px; border-radius: 8px; background: #000; }
    button { padding: 8px 16px; margin-right: 10px; cursor: pointer; }
    .accept { background: #25D366; color: white; border: none; border-radius: 4px; }
    .reject { background: #FF4136; color: white; border: none; border-radius: 4px; }
    .status { margin-top: 20px; padding: 10px; background: #e9e9e9; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Receptor de Chamadas WhatsApp</h1>

    <div class="status" id="status">
      Aguardando chamadas...
    </div>

    <div class="call-container" id="call-container">
      <h2>Chamada Recebida</h2>
      <p id="caller-info">De: <span id="caller-id"></span></p>
      <p>Tipo: <span id="call-type"></span></p>

      <div class="call-controls" id="incoming-controls">
        <button class="accept" id="accept-call">Atender</button>
        <button class="reject" id="reject-call">Rejeitar</button>
      </div>

      <div class="call-controls" id="active-controls" style="display: none;">
        <button class="reject" id="end-call">Encerrar</button>
      </div>

      <div class="videos">
        <div>
          <h3>Local</h3>
          <video id="local-video" autoplay muted></video>
        </div>
        <div>
          <h3>Remoto</h3>
          <video id="remote-video" autoplay></video>
        </div>
      </div>
    </div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    // Conectar ao servidor Socket.IO
    const socket = io();

    // Elements
    const statusEl = document.getElementById('status');
    const callContainer = document.getElementById('call-container');
    const callerIdEl = document.getElementById('caller-id');
    const callTypeEl = document.getElementById('call-type');
    const acceptCallBtn = document.getElementById('accept-call');
    const rejectCallBtn = document.getElementById('reject-call');
    const endCallBtn = document.getElementById('end-call');
    const incomingControls = document.getElementById('incoming-controls');
    const activeControls = document.getElementById('active-controls');
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');

    // Variáveis para WebRTC
    let peerConnection;
    let localStream;
    let currentCallId;

    // Configuração WebRTC
    const servers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    // Evento de chamada recebida
    socket.on('incoming-call', async (call) => {
      currentCallId = call.callId;
      callerIdEl.textContent = call.from;
      callTypeEl.textContent = call.isVideo ? 'Vídeo' : 'Áudio';

      statusEl.textContent = 'Chamada recebida!';
      callContainer.style.display = 'block';
      incomingControls.style.display = 'block';
      activeControls.style.display = 'none';
    });

    // Evento quando a chamada é encerrada
    socket.on('call-ended', ({ callId }) => {
      if (callId === currentCallId) {
        endCall();
        statusEl.textContent = 'Chamada encerrada';
      }
    });

    // Evento quando outro cliente responde à chamada
    socket.on('call-answered', async ({ callId, answer, clientId }) => {
      if (callId === currentCallId && peerConnection) {
        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
          statusEl.textContent = \`Chamada conectada com \${clientId}\`;
        } catch (error) {
          console.error('Erro ao definir resposta:', error);
        }
      }
    });

    // Evento para candidatos ICE
    socket.on('ice-candidate', async ({ callId, candidate, clientId }) => {
      if (callId === currentCallId && peerConnection) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error('Erro ao adicionar candidato ICE:', error);
        }
      }
    });

    // Iniciar mídia e preparar WebRTC
    async function setupMediaAndWebRTC(isVideo) {
      try {
        // Obter acesso à câmera e microfone
        localStream = await navigator.mediaDevices.getUserMedia({
          video: isVideo,
          audio: true
        });

        // Mostrar stream local
        localVideo.srcObject = localStream;

        // Criar conexão peer
        peerConnection = new RTCPeerConnection(servers);

        // Adicionar tracks ao peer connection
        localStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, localStream);
        });

        // Lidar com stream remoto
        peerConnection.ontrack = (event) => {
          remoteVideo.srcObject = event.streams[0];
        };

        // Lidar com candidatos ICE
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('ice-candidate', {
              callId: currentCallId,
              candidate: event.candidate
            });
          }
        };

        // Criar oferta
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Enviar oferta para o servidor
        socket.emit('answer-call', {
          callId: currentCallId,
          answer: offer
        });

        incomingControls.style.display = 'none';
        activeControls.style.display = 'block';

      } catch (error) {
        console.error('Erro ao configurar mídia:', error);
        statusEl.textContent = 'Erro ao acessar câmera/microfone';
      }
    }

    // Atender chamada
    acceptCallBtn.addEventListener('click', async () => {
      const isVideo = callTypeEl.textContent === 'Vídeo';
      statusEl.textContent = 'Conectando...';
      await setupMediaAndWebRTC(isVideo);
    });

    // Rejeitar chamada
    rejectCallBtn.addEventListener('click', () => {
      socket.emit('reject-call', { callId: currentCallId });
      callContainer.style.display = 'none';
      statusEl.textContent = 'Aguardando chamadas...';
    });

    // Encerrar chamada
    endCallBtn.addEventListener('click', () => {
      socket.emit('end-call', { callId: currentCallId });
      endCall();
    });

    // Função para encerrar chamada
    function endCall() {
      if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
      }

      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }

      localVideo.srcObject = null;
      remoteVideo.srcObject = null;

      callContainer.style.display = 'none';
      statusEl.textContent = 'Aguardando chamadas...';
      currentCallId = null;
    }

    // Lidar com chamadas ativas ao carregar a página
    socket.on('active-calls', (calls) => {
      if (calls.length > 0) {
        const call = calls[0];
        currentCallId = call.id;
        callerIdEl.textContent = call.from;
        callTypeEl.textContent = call.isVideo ? 'Vídeo' : 'Áudio';

        statusEl.textContent = 'Chamada ativa encontrada!';
        callContainer.style.display = 'block';
        incomingControls.style.display = 'block';
        activeControls.style.display = 'none';
      }
    });
  </script>
</body>
</html>
  `;

  fs.writeFileSync(path.join(publicDir, 'index.html'), htmlContent);
  console.log('Arquivos do cliente WebRTC criados com sucesso!');
}

// Executar o aplicativo
startWhatsAppCallHandler()
  .catch(err => console.error('Erro ao iniciar o handler de chamadas:', err))