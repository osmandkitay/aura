## 🚀 Pull Request

Thank you for contributing to AURA Protocol! Your contribution helps build a more open, interoperable web.

### 📋 Description

<!-- Provide a clear and concise description of what this PR does -->

**What does this PR do?**
- 

**Why is this change needed?**
- 

**How does this change work?**
- 

### 🎯 Type of Change

<!-- Mark the type of change with an [x] -->

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📚 Documentation update (changes to documentation only)
- [ ] 🎨 Code style/formatting (changes that do not affect the meaning of the code)
- [ ] ♻️ Refactoring (code change that neither fixes a bug nor adds a feature)
- [ ] ⚡ Performance improvement
- [ ] 🧪 Test addition/improvement
- [ ] 🔧 Build/CI/tooling changes
- [ ] 🌐 Community/project management

### 📦 Package Impact

<!-- Mark all packages affected by this change -->

- [ ] `@aura/protocol` (Core TypeScript interfaces and JSON Schema)
- [ ] `reference-server` (Next.js reference implementation)
- [ ] `reference-client` (Example client with LLM integration)
- [ ] CLI tools (`aura-validate`)
- [ ] Documentation
- [ ] Multiple packages
- [ ] Project infrastructure

### 🔗 Related Issues

<!-- Link related issues using keywords: Fixes #123, Closes #456, Relates to #789 -->

- Fixes #
- Relates to #

### 🧪 Testing

<!-- Describe the testing you've performed -->

**Test Coverage:**
- [ ] All existing tests pass
- [ ] New tests added for new functionality
- [ ] Tests cover edge cases
- [ ] Manual testing performed

**Testing Performed:**
<!-- Describe what testing you've done -->
- [ ] Unit tests: 
- [ ] Integration tests: 
- [ ] Manual testing: 
- [ ] Cross-platform testing: 

**Test Commands:**
```bash
# Commands used to test this change
pnpm test --run
pnpm --filter affected-package test
```

### 📖 Documentation

<!-- Mark what documentation has been updated -->

- [ ] Code comments updated/added
- [ ] README.md updated
- [ ] Package-specific documentation updated
- [ ] API documentation updated
- [ ] Examples updated/added
- [ ] No documentation changes needed

### ✅ Checklist

<!-- Ensure all items are completed before requesting review -->

**Code Quality:**
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] My changes generate no new warnings or errors
- [ ] I have added tests that prove my fix is effective or that my feature works

**Protocol Compliance:**
- [ ] Changes maintain backward compatibility (or breaking changes are clearly documented)
- [ ] JSON Schema updated if TypeScript interfaces changed
- [ ] URI Template/JSON Pointer compliance maintained (RFC 6570, RFC 6901)
- [ ] Reference implementations updated to reflect protocol changes

**Project Standards:**
- [ ] My commits have descriptive messages
- [ ] I have updated the version numbers appropriately (if applicable)
- [ ] I have checked that my changes don't break existing functionality

### 🔄 Breaking Changes

<!-- If this introduces breaking changes, describe them here -->

**Is this a breaking change?**
- [ ] Yes, this introduces breaking changes
- [ ] No, this is backward compatible

**If yes, describe the breaking changes:**
<!-- Explain what breaks and how users should migrate -->

**Migration Guide:**
<!-- Provide steps for users to update their code -->

```typescript
// Before
const oldWay = {};

// After  
const newWay = {};
```

### 🎪 Use Cases & Examples

<!-- Provide examples of how this change will be used -->

**Example Usage:**
```typescript
// Show how your changes would be used
import { NewFeature } from '@aura/protocol';

const example = new NewFeature({
  // configuration
});
```

**Benefits:**
- 
- 

### 📊 Performance Impact

<!-- If applicable, describe performance implications -->

- [ ] No performance impact
- [ ] Performance improvement (describe)
- [ ] Potential performance impact (describe and justify)

**Benchmarks/Measurements:**
<!-- Include before/after performance data if relevant -->

### 🌍 Community Impact

<!-- Describe how this affects the AURA community -->

**Who benefits from this change?**
- [ ] New AURA users
- [ ] Experienced implementers  
- [ ] Framework integrators
- [ ] Tool builders
- [ ] All users

**Community Considerations:**
- 

### 🔒 Security Considerations

<!-- Address any security implications -->

- [ ] No security implications
- [ ] Security improvement
- [ ] Potential security impact (describe)

**Security Review:**
<!-- If there are security implications, describe them -->

### 📝 Additional Notes

<!-- Any additional information that reviewers should know -->

**Implementation Details:**
<!-- Technical details about your implementation -->

**Future Considerations:**
<!-- Ideas for future improvements or related work -->

**Questions for Reviewers:**
<!-- Specific areas where you'd like feedback -->

---

### 🤝 Contributor Agreement

By submitting this pull request, I confirm that:

- [ ] I have read and agree to follow the project's Code of Conduct
- [ ] I have read the Contributing Guidelines
- [ ] My contribution is licensed under the MIT License
- [ ] I understand that my contribution may be used in derivative works

---

**Thank you for contributing to AURA Protocol! 🚀**

*Building a more open, interoperable web together.* 