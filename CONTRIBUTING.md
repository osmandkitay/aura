# Contributing to AURA Protocol

Thank you for contributing to AURA! This project follows Aaron Swartz's philosophy of building open, accessible technology that democratizes information.

## 🌟 Mission

AURA creates an open protocol for machine-readable web interaction, breaking corporate control over AI-web interaction.

## 🚀 Quick Start

```bash
# Clone and setup
git clone https://github.com/osmandkitay/aura.git
cd aura
pnpm install

# Run tests
pnpm test --run

# Start reference server
pnpm --filter aura-reference-server dev
```

## 📁 Project Structure

- **`packages/aura-protocol/`**: Core TypeScript interfaces and JSON Schema
- **`packages/reference-server/`**: Next.js reference implementation  
- **`packages/reference-client/`**: Example client with LLM integration

## 📝 Contribution Types

### Protocol Enhancement
- JSON Schema improvements
- TypeScript interface refinements
- RFC compliance improvements

### Reference Implementation
- Bug fixes and performance improvements
- Better error handling
- Additional example capabilities

### Documentation
- Tutorial improvements
- Framework integration guides
- Troubleshooting guides

## 🔧 Development Guidelines

### Standards
1. **TypeScript First**: All code properly typed
2. **Test Coverage**: Comprehensive tests required
3. **RFC Compliance**: Follow web standards (RFC 6570, RFC 6901)
4. **Clean Code**: Readable, maintainable code
5. **Documentation**: Document new features and APIs

### Testing
```bash
# Run all tests
pnpm test --run

# Test specific package
pnpm --filter aura-protocol test
```

## 📬 Submitting Changes

### Pull Request Process
1. Fork and create feature branch from `main`
2. Make changes following guidelines
3. Ensure tests pass and add new tests
4. Update documentation as needed
5. Submit PR with clear description

### Commit Format
```
type(scope): brief description

Longer explanation if needed

Fixes #issue_number
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`

## 🤝 Community Standards

### Values
- **Openness**: Build public goods, not proprietary solutions
- **Quality**: Prioritize robust, well-tested code
- **Education**: Help others learn the protocol
- **Respect**: Treat all members with dignity

### Communication
- Be respectful and constructive
- Assume good intentions
- Help others learn and grow

## 🎯 Current Priorities

### High Priority
- Core protocol stability and validation
- Documentation improvements
- Community foundation

### Medium Priority
- CLI tool enhancements
- Reference implementation examples
- Framework integrations

## 🌍 Building the Ecosystem

We provide:
- Clear protocol specification (TypeScript interfaces and JSON Schema)
- Working reference implementation (Next.js server and client examples)
- Educational foundation (documentation and examples)

The community builds:
- Framework integrations (Django, Laravel, Express, etc.)
- Language bindings (Python, Go, Rust, Java, etc.)
- Tools and utilities
- Real-world implementations

## 📄 License

By contributing to AURA, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for helping build a more open, interoperable web!** 🚀 