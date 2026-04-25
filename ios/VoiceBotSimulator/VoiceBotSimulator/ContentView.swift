import SwiftUI
import AVFoundation

// MARK: - Models
struct CallData: Codable {
    let call_id: Int?
    let customer_name: String?
    let phone_number: String?
}

// MARK: - View Model
class CallViewModel: ObservableObject {
    @Published var callStatus: CallState = .idle
    @Published var customerName: String = ""
    @Published var phoneNumber: String = ""
    @Published var callID: Int?
    
    enum CallState {
        case idle, ringing, connected, ended
    }
    
    private let baseURL = "http://localhost:8001/api/v1/simulator"
    private var timer: Timer?
    private var audioPlayer: AVAudioPlayer?
    private var audioRecorder: AVAudioRecorder?
    
    init() {
        startPolling()
    }
    
    func startPolling() {
        timer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { _ in
            guard self.callStatus == .idle else { return }
            self.checkIncomingCall()
        }
    }
    
    func checkIncomingCall() {
        guard let url = URL(string: "\(baseURL)/poll") else { return }
        URLSession.shared.dataTask(with: url) { data, _, _ in
            guard let data = data,
                  let res = try? JSONDecoder().decode(CallData.self, from: data),
                  let id = res.call_id else { return }
            
            DispatchQueue.main.async {
                self.callID = id
                self.customerName = res.customer_name ?? "Unknown"
                self.phoneNumber = res.phone_number ?? "mobile"
                self.callStatus = .ringing
            }
        }.resume()
    }
    
    func acceptCall() {
        guard let id = callID, let url = URL(string: "\(baseURL)/\(id)/accept") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        
        URLSession.shared.dataTask(with: request) { data, _, _ in
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let base64 = json["audio_base64"] as? String,
                  let audioData = Data(base64Encoded: base64) else { return }
            
            DispatchQueue.main.async {
                self.callStatus = .connected
                self.playAudio(data: audioData)
            }
        }.resume()
    }
    
    func endCall() {
        callStatus = .ended
        audioPlayer?.stop()
        stopRecording()
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            self.callStatus = .idle
        }
    }
    
    private func playAudio(data: Data) {
        do {
            audioPlayer = try AVAudioPlayer(data: data)
            audioPlayer?.play()
            // Start recording after bot finishes speaking or during?
            // Usually we record after it says "Say Yes/No"
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                self.startRecording()
            }
        } catch {
            print("Playback error")
        }
    }
    
    func startRecording() {
        let settings = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 12000,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]
        
        let path = getDocumentsDirectory().appendingPathComponent("response.m4a")
        do {
            audioRecorder = try AVAudioRecorder(url: path, settings: settings)
            audioRecorder?.record()
            print("Recording started...")
            // Record for 3 seconds then upload
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
                self.stopRecording()
            }
        } catch {
            print("Recording failed")
        }
    }
    
    func stopRecording() {
        audioRecorder?.stop()
        uploadAudio()
    }
    
    func uploadAudio() {
        guard let id = callID else { return }
        let path = getDocumentsDirectory().appendingPathComponent("response.m4a")
        let url = URL(string: "\(baseURL)/\(id)/upload-audio")!
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        var data = Data()
        data.append("--\(boundary)\r\n".data(using: .utf8)!)
        data.append("Content-Disposition: form-data; name=\"file\"; filename=\"response.m4a\"\r\n".data(using: .utf8)!)
        data.append("Content-Type: audio/m4a\r\n\r\n".data(using: .utf8)!)
        data.append(try! Data(contentsOf: path))
        data.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        
        URLSession.shared.uploadTask(with: request, from: data) { _, _, _ in
            DispatchQueue.main.async {
                self.endCall()
            }
        }.resume()
    }
    
    private func getDocumentsDirectory() -> URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }
}

// MARK: - UI Components
struct CallView: View {
    @StateObject var vm = CallViewModel()
    
    var body: some View {
        ZStack {
            Color.black.edgesIgnoringSafeArea(.all)
            
            switch vm.callStatus {
            case .idle:
                VStack {
                    Text("Phone").foregroundColor(.white).font(.title)
                    Text("No recent calls").foregroundColor(.gray)
                }
                
            case .ringing:
                RingingView(name: vm.customerName, number: vm.phoneNumber, onAccept: vm.acceptCall, onDecline: vm.endCall)
                
            case .connected:
                ActiveCallView(name: vm.customerName, onEnd: vm.endCall)
                
            case .ended:
                VStack {
                    Text(vm.customerName).foregroundColor(.white).font(.largeTitle)
                    Text("Call Ended").foregroundColor(.gray).font(.title2)
                }
            }
        }
    }
}

struct RingingView: View {
    let name: String
    let number: String
    let onAccept: () -> Void
    let onDecline: () -> Void
    
    var body: some View {
        VStack {
            Spacer()
            Text(name).font(.system(size: 40, weight: .light)).foregroundColor(.white)
            Text(number).font(.title3).foregroundColor(.gray)
            Spacer()
            HStack(spacing: 80) {
                Button(action: onDecline) {
                    VStack {
                        Image(systemName: "phone.down.fill").font(.system(size: 40)).padding(25).background(Color.red).clipShape(Circle())
                        Text("Decline").foregroundColor(.white).font(.caption)
                    }
                }
                Button(action: onAccept) {
                    VStack {
                        Image(systemName: "phone.fill").font(.system(size: 40)).padding(25).background(Color.green).clipShape(Circle())
                        Text("Accept").foregroundColor(.white).font(.caption)
                    }
                }
            }.padding(.bottom, 60)
        }
    }
}

struct ActiveCallView: View {
    let name: String
    let onEnd: () -> Void
    
    var body: some View {
        VStack {
            Spacer()
            Text(name).font(.system(size: 40, weight: .light)).foregroundColor(.white)
            Text("00:02").foregroundColor(.gray)
            Spacer()
            Button(action: onEnd) {
                Image(systemName: "phone.down.fill").font(.system(size: 40)).padding(25).background(Color.red).clipShape(Circle())
            }.padding(.bottom, 60)
        }
    }
}

@main
struct VoiceBotApp: App {
    var body: some Scene {
        WindowGroup {
            CallView()
        }
    }
}