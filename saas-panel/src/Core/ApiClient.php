<?php
// ApiClient — wrapper HTTP ke /api/internal/saas/* di Next.js.
// Selalu inject x-internal-api-key. JANGAN pernah log nilai key.

namespace App\Core;

use App\Config;

class ApiClient
{
    private string $baseUrl;
    private string $apiKey;
    private int $timeout;

    public function __construct()
    {
        Config::load();
        $this->baseUrl = rtrim(Config::get('API_BASE_URL', 'http://127.0.0.1:3000'), '/');
        $this->apiKey = Config::get('INTERNAL_API_KEY', '');
        $this->timeout = 10;
    }

    public function get(string $path, array $query = []): array
    {
        $url = $this->baseUrl . $path;
        if ($query) $url .= '?' . http_build_query($query);
        return $this->request('GET', $url, null, true);
    }

    public function post(string $path, array $body = []): array
    {
        return $this->request('POST', $this->baseUrl . $path, $body, false);
    }

    public function patch(string $path, array $body = []): array
    {
        return $this->request('PATCH', $this->baseUrl . $path, $body, false);
    }

    public function put(string $path, array $body = []): array
    {
        return $this->request('PUT', $this->baseUrl . $path, $body, false);
    }

    public function delete(string $path): array
    {
        return $this->request('DELETE', $this->baseUrl . $path, null, false);
    }

    // Return shape: ['ok'=>bool, 'status'=>int, 'data'=>mixed, 'error'=>string|null]
    private function request(string $method, string $url, ?array $body, bool $retry): array
    {
        $attempts = 0;
        $maxAttempts = $retry ? 2 : 1; // retry 1x cuma buat GET idempoten

        do {
            $attempts++;
            $ch = curl_init($url);
            $headers = [
                'x-internal-api-key: ' . $this->apiKey,
                'Accept: application/json',
            ];
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CUSTOMREQUEST => $method,
                CURLOPT_TIMEOUT => $this->timeout,
                CURLOPT_HTTPHEADER => $headers,
            ]);
            if ($body !== null) {
                $headers[] = 'Content-Type: application/json';
                curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
            }

            $raw = curl_exec($ch);
            $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr = curl_error($ch);
            curl_close($ch);

            if ($raw === false) {
                if ($attempts < $maxAttempts) continue;
                return ['ok' => false, 'status' => 0, 'data' => null,
                        'error' => 'Koneksi ke API gagal: ' . $curlErr];
            }

            $decoded = json_decode($raw, true);
            if ($status >= 200 && $status < 300) {
                return ['ok' => true, 'status' => $status,
                        'data' => $decoded['data'] ?? $decoded, 'error' => null];
            }

            // retry GET on 5xx only
            if ($retry && $status >= 500 && $attempts < $maxAttempts) continue;

            return ['ok' => false, 'status' => $status, 'data' => null,
                    'error' => self::mapError($status, $decoded)];
        } while ($attempts < $maxAttempts);

        return ['ok' => false, 'status' => 0, 'data' => null, 'error' => 'Unknown error'];
    }

    private static function mapError(int $status, $decoded): string
    {
        $bodyErr = is_array($decoded) ? ($decoded['error'] ?? null) : null;
        return match (true) {
            $status === 401 => 'Internal API key tidak valid (401).',
            $status === 429 => 'Terlalu banyak percobaan, coba lagi nanti (429).',
            $status === 503 => 'API internal belum dikonfigurasi (503).',
            $status >= 500  => 'Server API error (' . $status . ').',
            default         => $bodyErr ?: ('Request gagal (' . $status . ').'),
        };
    }
}
