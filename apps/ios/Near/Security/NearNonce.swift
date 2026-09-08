import CryptoKit
import Foundation
import Security

enum NearNonce {
    static func random(length: Int = 32) throws -> String {
        var bytes = [UInt8](repeating: 0, count: length)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard status == errSecSuccess else { throw NearClientError.keychain(status) }
        return Data(bytes).base64EncodedString()
    }

    static func sha256(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
