import 'package:flutter/material.dart';
import '../theme.dart';
import '../icons.dart';
import 'package:provider/provider.dart';

import '../../state/l10n.dart';
import '../../state/session.dart';
import '../widgets/common.dart';

/// Log in / create account. Pops with `true` once signed in.
class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key, this.startOnRegister = false});
  final bool startOnRegister;
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  late bool _register = widget.startOnRegister;
  bool _busy = false;
  bool _hide = true;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate() || _busy) return;
    setState(() => _busy = true);
    final s = context.read<SessionController>();
    try {
      if (_register) {
        await s.register(_name.text.trim(), _email.text.trim(), _password.text);
      } else {
        await s.login(_email.text.trim(), _password.text);
      }
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showSnack(context, errorText(e), error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(padding: const EdgeInsets.all(20), children: [
            Center(
              child: Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(color: const Color(0xFF3B4733), borderRadius: BorderRadius.circular(16)),
                child: const Icon(Zi.bagOn, color: kSurface, size: 34),
              ),
            ),
            const SizedBox(height: 16),
            Text(_register ? t.t('join') : t.t('welcome_back'), textAlign: TextAlign.center, style: serif(24)),
            const SizedBox(height: 24),
            if (_register) ...[
              TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                autofillHints: const [AutofillHints.name],
                decoration: InputDecoration(labelText: t.t('full_name')),
                validator: (v) => (v == null || v.trim().isEmpty) ? t.t('required_field') : null,
              ),
              const SizedBox(height: 12),
            ],
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              decoration: InputDecoration(labelText: t.t('email')),
              validator: (v) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch((v ?? '').trim()) ? null : t.t('required_field'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _password,
              obscureText: _hide,
              autofillHints: [_register ? AutofillHints.newPassword : AutofillHints.password],
              decoration: InputDecoration(
                labelText: t.t('password'),
                helperText: _register ? t.t('password_hint') : null,
                suffixIcon: IconButton(icon: Icon(_hide ? Zi.show : Zi.hide), onPressed: () => setState(() => _hide = !_hide)),
              ),
              validator: (v) => (v ?? '').length >= (_register ? 8 : 1) ? null : t.t('password_hint'),
              onFieldSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: kSurface)) : Text(_register ? t.t('register') : t.t('login')),
            ),
            const SizedBox(height: 8),
            TextButton(onPressed: () => setState(() => _register = !_register), child: Text(_register ? t.t('have_account') : t.t('no_account'))),
          ]),
        ),
      ),
    );
  }
}
