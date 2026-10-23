import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, useColorScheme, View } from 'react-native';

import { isConfigured, supabase } from '@/lib/supabase';
import { useAction } from '@/lib/useLoad';
import { Button, ErrorText, Field, Screen, Segmented, T } from '@/ui/components';
import { brand, space, usePalette } from '@/ui/theme';

export default function SignIn() {
  const c = usePalette();
  const scheme = useColorScheme();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const submit = () =>
    run(async () => {
      setInfo(null);
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        if (!name.trim()) throw new Error('Add your name so your buddies know who you are.');
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: name.trim() },
            // If email confirmation is on, bring people back to this site instead of localhost.
            emailRedirectTo: Platform.OS === 'web' ? window.location.origin + '/therut/' : undefined,
          },
        });
        if (error) throw error;
        if (!data.session) setInfo('Check your email to confirm your account, then sign in.');
      }
    });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ alignItems: 'center', gap: space.s, paddingTop: space.xxxl, paddingBottom: space.l }}>
          <T variant="display" style={[styles.wordmark, { color: scheme === 'dark' ? c.text : brand.pine }]}>
            {'THE\nRUT'}
          </T>
          <T muted>League scores for the crew</T>
        </View>
        {!isConfigured ? (
          <ErrorText error="Supabase isn't set up yet. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env." />
        ) : null}
        <Segmented
          options={[
            { value: 'in', label: 'Sign in' },
            { value: 'up', label: 'Create account' },
          ]}
          value={mode}
          onChange={setMode}
        />
        {mode === 'up' ? <Field label="Name" value={name} onChangeText={setName} autoComplete="name" /> : null}
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          hint={mode === 'up' ? 'At least 6 characters.' : undefined}
        />
        <ErrorText error={error} />
        {info ? <T>{info}</T> : null}
        <Button title={mode === 'in' ? 'Sign in' : 'Create account'} onPress={submit} busy={busy} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wordmark: { fontSize: 96, lineHeight: 88, textAlign: 'center', letterSpacing: 2 },
});
