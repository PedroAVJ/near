"""Public profile reads must never acquire the visitor's private authority."""
import base64
import json
import unittest
from unittest import mock
from urllib.error import HTTPError

from test_near_context_mcp import _load_server


class PublicProfileTests(unittest.TestCase):
    def setUp(self):
        self.server = _load_server()
        self.text = '# Example Person\nPublished by Example Person.\n'
        self.file = {
            'type': 'file', 'encoding': 'base64',
            'size': len(self.text.encode()),
            'content': base64.b64encode(self.text.encode()).decode(),
        }
        self.responses = [
            {'private': False, 'visibility': 'public', 'default_branch': 'profile/current'},
            {'sha': 'a' * 40}, self.file,
        ]

    def test_public_read_pins_source_and_never_reads_private_configuration(self):
        with mock.patch.object(self.server, '_public_json', side_effect=self.responses) as fetch, \
                mock.patch.object(self.server, '_repository', side_effect=AssertionError('private configuration read')), \
                mock.patch.object(self.server, '_gh', side_effect=AssertionError('authenticated read')):
            result = self.server.read_public_profile('example-owner/profile')
        self.assertEqual(self.text, result['content'])
        self.assertEqual('public', result['visibility'])
        self.assertIn('/blob/' + 'a' * 40 + '/public/profile.md', result['source_url'])
        self.assertIn('not the person speaking', result['attribution'])
        self.assertEqual('repos/example-owner/profile/commits/profile%2Fcurrent', fetch.call_args_list[1].args[0])
        self.assertEqual('repos/example-owner/profile/contents/public/profile.md?ref=' + 'a' * 40, fetch.call_args_list[2].args[0])

    def test_invalid_repository_cannot_change_host_path_or_scope(self):
        with mock.patch.object(self.server, '_public_json') as fetch:
            for repository in ['', None, 'https://github.com/a/b', 'owner/..', 'owner/.', 'a/b?ref=x', 'a/b/extra', 'a/b#fragment', 'a/b%2fsecret']:
                with self.assertRaises(self.server.NearContextError):
                    self.server.read_public_profile(repository)
            fetch.assert_not_called()

    def test_nonpublic_or_missing_visibility_fails_before_content_read(self):
        for metadata in [{'private': True, 'visibility': 'private'}, {'private': False}, {'visibility': 'public'}, {'private': False, 'visibility': 'internal'}]:
            with mock.patch.object(self.server, '_public_json', return_value=metadata) as fetch:
                with self.assertRaisesRegex(self.server.NearContextError, 'Only a public'):
                    self.server.read_public_profile('example-owner/profile')
                self.assertEqual(1, fetch.call_count)

    def test_invalid_content_and_size_are_rejected(self):
        bad = [
            {**self.file, 'type': 'dir'},
            {**self.file, 'type': 'symlink'},
            {**self.file, 'submodule_git_url': 'https://example.com/elsewhere'},
            {**self.file, 'size': True},
            {**self.file, 'size': 33 * 1024},
            {**self.file, 'size': 1},
            {**self.file, 'content': 'invalid!'},
            {**self.file, 'content': '/w==', 'size': 1},
        ]
        for payload in bad:
            with mock.patch.object(self.server, '_public_json', side_effect=[*self.responses[:2], payload]):
                with self.assertRaises(self.server.NearContextError):
                    self.server.read_public_profile('example-owner/profile')

    def test_public_transport_ignores_credentials_and_does_not_follow_redirects(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'{"private":false}'
        opener = mock.Mock()
        opener.open.return_value = response
        with mock.patch.dict('os.environ', {'GH_TOKEN': 'test-never-forward', 'GITHUB_TOKEN': 'test-never-forward'}), \
                mock.patch.object(self.server, 'build_opener', return_value=opener):
            self.server._public_json('repos/example-owner/profile')
        request = opener.open.call_args.args[0]
        self.assertEqual('https://api.github.com/repos/example-owner/profile', request.full_url)
        self.assertIsNone(request.get_header('Authorization'))
        self.assertEqual(15, opener.open.call_args.kwargs['timeout'])
        self.assertIsNone(self.server._NoPublicRedirects().redirect_request(None, None, 302, '', {}, 'https://elsewhere.example'))

    def test_http_failure_is_a_tool_error_without_private_fallback(self):
        opener = mock.Mock()
        opener.open.side_effect = HTTPError('https://api.github.com/example', 404, 'Not Found', {}, None)
        with mock.patch.object(self.server, 'build_opener', return_value=opener), \
                mock.patch.object(self.server, '_gh', side_effect=AssertionError('private fallback')):
            result = self.server._handle({'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': 'read_public_profile', 'arguments': {'repository': 'example-owner/profile'}}})
        self.assertTrue(result['result']['isError'])
        self.assertIn('Public profile unavailable', result['result']['content'][0]['text'])


if __name__ == '__main__':
    unittest.main()
